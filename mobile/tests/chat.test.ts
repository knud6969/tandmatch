import { startAnonymousSession } from "~/api/auth";
import { getChat, sendChatMessage } from "~/api/chat";
import { ApiRequestError } from "~/api/client";
import { getSession, saveTermsToken } from "~/auth/tokens";
import { hasCurrentConsent } from "@/lib/domain/consents";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import type { ChatTurnResponse } from "@/lib/types/ai";
import { runChatTurn } from "~/utils/chat-turn";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStore.delete(key)),
}));

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const session = { accessToken: "a1", refreshToken: "r1", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
const message = (over: object = {}) => ({
  id: "m", role: "assistant", content: "x", preliminaryAssessment: null, suggestedServices: [], emergency: false,
  outOfScopeTopics: [], blocked: false, createdAt: "", ...over,
});
const turn = (over: Partial<ChatTurnResponse> = {}): ChatTurnResponse =>
  ({ userMessage: message({ role: "user" }), assistantMessage: message(), outOfScopeNotice: false, emergency: false, readyForSummary: false, messagesLeft: 29, ...over }) as ChatTurnResponse;

let calls: { url: string; init: RequestInit }[];
let respond: (url: string) => Response;

beforeEach(async () => {
  mockStore.clear();
  calls = [];
  process.env.EXPO_PUBLIC_API_URL = "http://api.test";
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond(String(url));
  }) as typeof fetch;
  await saveTermsToken("t");
});

// Sikrer, at chatten bruger de rigtige endpoints, og at en anonym start kun gemmer tokens, når serveren giver nye.
describe("chat-API", () => {
  it("sender beskeden som JSON til sagens chat", async () => {
    respond = () => json(201, turn());
    await sendChatMessage("c1", "Jeg har tandpine");
    expect(calls[0].url).toBe("http://api.test/api/cases/c1/chat");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ message: "Jeg har tandpine" });
  });

  it("henter samtalen", async () => {
    respond = () => json(200, { conversationId: null, status: "active", messages: [], messagesLeft: 30, readyForSummary: false });
    await expect(getChat("c1")).resolves.toMatchObject({ messagesLeft: 30 });
  });

  it("anonym start gemmer tokens ved 201 og sender samtykkets tekstversion", async () => {
    respond = () => json(201, { caseId: "c1", expiresAt: "2026-10-21T00:00:00Z", session });
    const result = await startAnonymousSession();
    expect(result.caseId).toBe("c1");
    expect((await getSession())?.accessToken).toBe("a1");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ aiConsent: { textVersion: CONSENT_TEXT_VERSIONS.ai_processing } });
  });

  it("anonym start ved 200 (eksisterende kladde) rører ikke tokens", async () => {
    respond = () => json(200, { caseId: "c9", expiresAt: "2026-10-21T00:00:00Z" });
    expect((await startAnonymousSession()).caseId).toBe("c9");
    expect(await getSession()).toBeNull();
  });
});

// Sikrer, at hvert udfald af en tur (svar, manglende samtykke, AI utilgængelig, fejl) kan skelnes, så beskeder aldrig sendes to gange.
describe("runChatTurn", () => {
  it("giver svaret ved succes", async () => {
    const outcome = await runChatTurn(async () => turn({ readyForSummary: true }));
    expect(outcome).toMatchObject({ kind: "ok", turn: { readyForSummary: true } });
  });

  it("403 CONSENT_REQUIRED viser samtykke-gaten", async () => {
    respond = () => json(403, { error: { code: "CONSENT_REQUIRED", message: "x" } });
    expect(await runChatTurn(() => sendChatMessage("c1", "hej"))).toEqual({ kind: "consent_required" });
  });

  it("503 AI_UNAVAILABLE betyder gemt uden svar: samtalen hentes igen, beskeden sendes ikke igen", async () => {
    respond = () => json(503, { error: { code: "AI_UNAVAILABLE", message: "x" } });
    expect(await runChatTurn(() => sendChatMessage("c1", "hej"))).toEqual({ kind: "saved_without_reply" });
    expect(calls).toHaveLength(1);
  });

  it("andre fejl giver den danske tekst, så beskeden kan lægges tilbage i feltet", async () => {
    respond = () => json(429, { error: { code: "CHAT_LIMIT", message: "x" } });
    const outcome = await runChatTurn(() => sendChatMessage("c1", "hej"));
    expect(outcome.kind).toBe("failed");
    expect(outcome.kind === "failed" && outcome.message.length).toBeGreaterThan(5);
    expect(new ApiRequestError(429, "CHAT_LIMIT", "").message).toBe(outcome.kind === "failed" ? outcome.message : "");
  });

  it("netværksfejl er en almindelig fejl", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("net");
    }) as typeof fetch;
    expect((await runChatTurn(() => sendChatMessage("c1", "hej"))).kind).toBe("failed");
  });
});

// Sikrer, at kun et aktivt samtykke i den gældende tekstversion tæller (GDPR).
describe("samtykke", () => {
  it("kun et aktivt samtykke i gældende tekstversion tæller", () => {
    const base = { id: "1", type: "ai_processing" as const, textVersion: CONSENT_TEXT_VERSIONS.ai_processing, grantedAt: "", grantedWhileAnonymous: false, withdrawnAt: null };
    expect(hasCurrentConsent([base], "ai_processing")).toBe(true);
    expect(hasCurrentConsent([{ ...base, withdrawnAt: "2026-10-19" }], "ai_processing")).toBe(false);
    expect(hasCurrentConsent([{ ...base, textVersion: "ai_processing@gammel" }], "ai_processing")).toBe(false);
    expect(hasCurrentConsent([base], "image_upload")).toBe(false);
  });
});

// Sikrer, at et akut svar vises som et almindeligt svar uden særskilt blok.
describe("akut", () => {
  it("et akut svar er et almindeligt svar: teksten vises uændret, og der er ingen særskilt blok", async () => {
    const emergencyTurn = turn({ emergency: true, assistantMessage: message({ emergency: true, content: "Kontakt tandlægevagten." }) as never });
    const outcome = await runChatTurn(async () => emergencyTurn);
    expect(outcome).toMatchObject({ kind: "ok", turn: { emergency: true, assistantMessage: { content: "Kontakt tandlægevagten." } } });
  });
});
