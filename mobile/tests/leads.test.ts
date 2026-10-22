import { saveSession, saveTermsToken, getSession } from "~/auth/tokens";
import { convertAnonymous } from "~/api/auth";
import { grantConsent } from "~/api/consents";
import { sendLeads } from "~/api/leads";
import { ApiRequestError } from "~/api/client";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/common/constants/limits";
import { parseClinicIds, sendBlockReason, setLimits, toggleClinic, toggleId, getSelection, clearSelection } from "~/utils/lead-selection";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStore.delete(key)),
}));

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let calls: { url: string; init: RequestInit }[];
let responses: (() => Response)[];

beforeEach(async () => {
  mockStore.clear();
  calls = [];
  responses = [];
  process.env.EXPO_PUBLIC_API_URL = "http://api.test";
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return (responses.shift() ?? (() => json(500)))();
  }) as typeof fetch;
  await saveTermsToken("t");
  await saveSession({ accessToken: "anon-token", refreshToken: "anon-refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
});

const auth = (i: number) => (calls[i].init.headers as Record<string, string>).Authorization;

// Sikrer, at valget af op til 3 klinikker følger reglerne, og at en afvist afsendelse får en forklaring.
describe("valg af klinikker", () => {
  it("vælger højst de ledige pladser og ingen dubletter", () => {
    let ids: string[] = [];
    for (const id of ["a", "b", "c", "d"]) ids = toggleId(ids, id, MAX_ACTIVE_LEADS_PER_CASE);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(toggleId(ids, "b", 3)).toEqual(["a", "c"]);
    expect(toggleId(["a"], "x", 3, ["x"])).toEqual(["a"]);
    expect(toggleId(["a"], "b", 1)).toEqual(["a"]);
  });

  it("holdes pr. sag og beskæres til pladserne", () => {
    setLimits("c1", 2, ["k"]);
    toggleClinic("c1", "a");
    toggleClinic("c1", "b");
    toggleClinic("c1", "c");
    toggleClinic("c1", "k");
    expect(getSelection("c1").ids).toEqual(["a", "b"]);
    setLimits("c1", 1, []);
    expect(getSelection("c1").ids).toEqual(["a"]);
    clearSelection("c1");
    expect(getSelection("c1").ids).toEqual([]);
  });

  it("læser klinik-id'er fra ruten", () => {
    expect(parseClinicIds("a,b,a,,c,d")).toEqual(["a", "b", "c"]);
    expect(parseClinicIds(undefined)).toEqual([]);
  });

  it("forklarer, hvorfor der ikke kan sendes", () => {
    const ok = { status: "draft", canSend: true, leadCount: 0, totalLeadCount: 0 };
    const clinics = [{ id: "a", canReceiveLeads: true }, { id: "b", canReceiveLeads: false }];
    expect(sendBlockReason(ok, ["a"], clinics, [], 3)).toBeNull();
    expect(sendBlockReason(ok, [], clinics, [], 3)).toBe("none");
    expect(sendBlockReason(ok, ["a"], clinics, [], 0)).toBe("no_slots");
    expect(sendBlockReason({ ...ok, canSend: false }, ["a"], clinics, [], 3)).toBe("not_ready");
    expect(sendBlockReason(ok, ["a", "b"], clinics, [], 1)).toBe("too_many");
    expect(sendBlockReason(ok, ["a"], clinics, ["a"], 3)).toBe("contacted");
    expect(sendBlockReason(ok, ["a", "b"], clinics, [], 3)).toBe("unavailable");
    expect(sendBlockReason({ ...ok, status: "closed" }, ["a"], clinics, [], 3)).toBe("closed");
  });
});

// Sikrer hele vejen fra anonym kladde til sendt lead: de nye tokens bruges, og samtykket gives før afsendelsen.
describe("anonym → konto → samtykke → send", () => {
  it("konverterer med den anonyme bearer, gemmer nye tokens og bruger dem til samtykke og send", async () => {
    responses = [
      () => json(200, { role: "patient", session: { accessToken: "new-token", refreshToken: "new-refresh", expiresAt: new Date(Date.now() + 3_600_000).toISOString() } }),
      () => json(201, {}),
      () => json(201, { leads: [{ id: "l1", clinic: { id: "a", name: "Klinik A", city: "By", logoUrl: null, removed: false }, status: "sent" }] }),
    ];
    await convertAnonymous({ email: "a@b.dk", password: "kodeord123", firstName: "Anna" });
    expect(calls[0].url).toBe("http://api.test/api/auth/convert");
    expect(auth(0)).toBe("Bearer anon-token");
    expect((await getSession())?.accessToken).toBe("new-token");

    await grantConsent("health_data_sharing");
    expect(calls[1].url).toBe("http://api.test/api/consents");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ type: "health_data_sharing", textVersion: CONSENT_TEXT_VERSIONS.health_data_sharing });
    expect(auth(1)).toBe("Bearer new-token");

    const leads = await sendLeads("c1", ["a"]);
    expect(calls[2].url).toBe("http://api.test/api/cases/c1/leads");
    expect(calls[2].init.method).toBe("POST");
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ clinicIds: ["a"] });
    expect(auth(2)).toBe("Bearer new-token");
    expect(leads[0].status).toBe("sent");
  });
});

// Sikrer, at serverens fejlkoder bevares og får en dansk tekst.
describe("fejlkoder ved afsendelse", () => {
  const fail = (status: number, code: string) => async () => {
    responses = [() => json(status, { error: { code, message: "x" } })];
    return sendLeads("c1", ["a"]).then(
      () => {
        throw new Error("skulle fejle");
      },
      (e: unknown) => e as ApiRequestError,
    );
  };

  it.each([
    [403, "CONSENT_REQUIRED"],
    [409, "LEAD_LIMIT"],
    [409, "CLINIC_NOT_AVAILABLE"],
    [429, "LEAD_DAILY_LIMIT"],
  ])("%s %s giver kode og dansk tekst", async (status, code) => {
    const e = await fail(status, code)();
    expect(e).toBeInstanceOf(ApiRequestError);
    expect(e.code).toBe(code);
    expect(e.status).toBe(status);
    expect(e.message).not.toBe("");
    expect(e.message).not.toBe(code);
  });
});
