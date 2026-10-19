import { saveTermsToken } from "~/auth/tokens";
import { approveSummary, confirmServices, createSummary, updateCase } from "~/api/cases";
import { nextCaseFlowStep } from "@/lib/domain/case-flow";
import { MAX_CONFIRMED_SERVICES_PER_CASE } from "@/lib/constants/limits";
import type { SummaryResponse } from "@/lib/types/ai";
import {
  cardModes,
  initialServiceSelection,
  lowMessagesLeft,
  shouldAutoGenerate,
  summaryAttemptFromError,
  summaryAttemptFromResponse,
  toggleSelection,
  toServiceInputs,
} from "~/utils/case-cards";
import { ApiRequestError } from "~/api/client";
import { postalCodeError } from "~/components/case/postal-code-card";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStore.delete(key)),
}));

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let calls: { url: string; init: RequestInit }[];
let respond: () => Response;

beforeEach(async () => {
  mockStore.clear();
  calls = [];
  process.env.EXPO_PUBLIC_API_URL = "http://api.test";
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  await saveTermsToken("t");
});

const body = () => JSON.parse(String(calls[0].init.body));

describe("kortenes API-kald", () => {
  it("bekræfter behandlinger med suggestedByAi", async () => {
    respond = () => json(200, {});
    await confirmServices("c1", toServiceInputs(["a", "b"], ["a"]));
    expect(calls[0].url).toBe("http://api.test/api/cases/c1/services");
    expect(calls[0].init.method).toBe("PUT");
    expect(body()).toEqual({ services: [{ serviceId: "a", suggestedByAi: true }, { serviceId: "b", suggestedByAi: false }] });
  });

  it("gemmer tidsrum og postnummer med PATCH", async () => {
    respond = () => json(200, {});
    await updateCase("c1", { preferredTimeframe: "asap" });
    expect(calls[0].init.method).toBe("PATCH");
    expect(body()).toEqual({ preferredTimeframe: "asap" });
  });

  it("opsummering: POST laver udkast, PUT godkender med teksten", async () => {
    respond = () => json(200, { summary: null, retakeImages: [], outOfScopeNotice: false, fallback: "none", generationsLeft: 2 });
    await createSummary("c1");
    expect(calls[0].init.method).toBe("POST");
    respond = () => json(200, { summaryText: "Tekst", summaryApprovedAt: "x" });
    await approveSummary("c1", "Tekst");
    expect(calls[1].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ summaryText: "Tekst" });
  });
});

describe("hvilke kort der vises", () => {
  const dto = { status: "draft", services: [], preferredTimeframe: null, postalCode: null, summaryApprovedAt: null } as never;
  const chat = (over = {}) => ({ messages: [], status: "active", readyForSummary: false, ...over }) as never;

  it("chat: ingen kort", () => {
    expect(Object.values(cardModes(nextCaseFlowStep(dto, chat()))).every((m) => m === "hidden")).toBe(true);
  });

  it("akut: ingen kort og ingen særskilt blok", () => {
    const messages = [{ role: "assistant", emergency: true }];
    expect(Object.values(cardModes(nextCaseFlowStep(dto, chat({ messages }))).valueOf()).every((m) => m === "hidden")).toBe(true);
  });

  it("lukket samtale uden forslag giver behandlingskortet", () => {
    expect(cardModes(nextCaseFlowStep(dto, chat({ status: "closed" })))).toMatchObject({ services: "current", timeframe: "hidden" });
  });

  it("besvarede kort foldes sammen, det aktuelle er åbent, senere er skjult", () => {
    const withServices = { ...(dto as object), services: [{ id: "a" }], preferredTimeframe: "asap" } as never;
    expect(cardModes(nextCaseFlowStep(withServices, chat()))).toEqual({
      services: "answered",
      timeframe: "answered",
      postal_code: "current",
      summary: "hidden",
      ready: "hidden",
    });
  });

  it("billede efter godkendelse gør opsummeringen aktuel igen", () => {
    const all = { status: "draft", services: [{ id: "a" }], preferredTimeframe: "asap", postalCode: "2100", summaryApprovedAt: null } as never;
    expect(cardModes(nextCaseFlowStep(all, chat())).summary).toBe("current");
    expect(cardModes(nextCaseFlowStep({ ...(all as object), summaryApprovedAt: "x" } as never, chat())).ready).toBe("current");
  });

  it("sendt sag: ingen kort", () => {
    expect(Object.values(cardModes(nextCaseFlowStep({ ...(dto as object), status: "submitted" } as never, chat()))).every((m) => m === "hidden")).toBe(true);
  });
});

describe("behandlingsvalg", () => {
  it("forslagene er valgt fra start, og et bekræftet valg går forud", () => {
    expect(initialServiceSelection([], ["a", "b"])).toEqual(["a", "b"]);
    expect(initialServiceSelection(["c"], ["a"])).toEqual(["c"]);
  });

  it("højst MAX_CONFIRMED_SERVICES_PER_CASE, og et tryk fravælger", () => {
    const ids = Array.from({ length: MAX_CONFIRMED_SERVICES_PER_CASE }, (_, i) => `s${i}`);
    expect(toggleSelection(ids, "ekstra")).toEqual(ids);
    expect(toggleSelection(ids, "s0")).toEqual(ids.slice(1));
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
  });
});

describe("beskedloft", () => {
  it("advarer ved 5 og færre, men ikke ved 0 eller lukket samtale", () => {
    expect(lowMessagesLeft(6, false)).toBeNull();
    expect(lowMessagesLeft(5, false)).toBe(5);
    expect(lowMessagesLeft(1, false)).toBe(1);
    expect(lowMessagesLeft(0, false)).toBeNull();
    expect(lowMessagesLeft(3, true)).toBeNull();
  });
});

describe("opsummering", () => {
  const response = (over: Partial<SummaryResponse> = {}): SummaryResponse =>
    ({ summary: { summaryText: "Udkast" }, retakeImages: [], outOfScopeNotice: false, fallback: "none", generationsLeft: 2, ...over }) as SummaryResponse;

  it("et udkast bliver til tekst; write_yourself giver tomt felt", () => {
    expect(summaryAttemptFromResponse(response())).toMatchObject({ kind: "draft", text: "Udkast", generationsLeft: 2 });
    expect(summaryAttemptFromResponse(response({ summary: null, fallback: "write_yourself" }))).toMatchObject({ kind: "write_yourself" });
  });

  it("503, SUMMARY_LIMIT og ANON_CAP_REACHED giver Skriv selv", () => {
    expect(summaryAttemptFromError(new ApiRequestError(503, "AI_UNAVAILABLE", ""))).toMatchObject({ kind: "write_yourself", generationsLeft: null });
    for (const code of ["SUMMARY_LIMIT", "ANON_CAP_REACHED"]) {
      const attempt = summaryAttemptFromError(new ApiRequestError(429, code, ""));
      expect(attempt).toMatchObject({ kind: "write_yourself", generationsLeft: 0 });
      expect(attempt.kind === "write_yourself" && attempt.message).toBeTruthy();
    }
  });

  it("laver kun ét automatisk udkast", () => {
    expect(shouldAutoGenerate({ hasDraft: false, hasText: false, attempted: false })).toBe(true);
    expect(shouldAutoGenerate({ hasDraft: false, hasText: false, attempted: true })).toBe(false);
    expect(shouldAutoGenerate({ hasDraft: true, hasText: false, attempted: false })).toBe(false);
    expect(shouldAutoGenerate({ hasDraft: false, hasText: true, attempted: false })).toBe(false);
  });
});

describe("postnummer", () => {
  it("kræver fire cifre og giver den danske fejl", () => {
    expect(postalCodeError("2100")).toBeNull();
    expect(postalCodeError("21")).toBe("Angiv et gyldigt postnummer.");
    expect(postalCodeError("")).not.toBeNull();
  });
});
