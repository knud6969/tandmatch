import { loginKeepingDraft } from "~/api/auth";
import { getSession, saveSession, saveTermsToken } from "~/auth/tokens";
import { DEFAULT_RETURN_TO, safeReturnTo } from "~/utils/return-to";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStore.delete(key)),
}));

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const future = () => new Date(Date.now() + 3600_000).toISOString();
const anon = { accessToken: "anon", refreshToken: "ra", expiresAt: future() };
const account = { accessToken: "acc", refreshToken: "rc", expiresAt: future() };
const input = { email: "a@b.dk", password: "12345678" };
const CASE = "11111111-1111-4111-8111-111111111111";
let calls: { path: string; auth: string | undefined }[];
let routes: Record<string, () => Response>;

beforeEach(async () => {
  mockStore.clear();
  calls = [];
  process.env.EXPO_PUBLIC_API_URL = "http://api.test";
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace("http://api.test", "");
    calls.push({ path, auth: (init?.headers as Record<string, string>).Authorization });
    return routes[path]();
  }) as typeof fetch;
  await saveTermsToken("t");
  await saveSession(anon);
  routes = {
    "/api/session/claim-token": () => json(200, { claimToken: "x".repeat(64), expiresAt: future() }),
    "/api/auth/login": () => json(200, { userId: "u", role: "patient", session: account }),
    "/api/session/claim": () => json(200, { caseId: CASE, moved: true }),
  };
});

describe("loginKeepingDraft", () => {
  it("claim-token før login (anonymt bearer), claim efter (nyt bearer) og sagen følger med", async () => {
    const result = await loginKeepingDraft(input, { anonymous: true });
    expect(calls.map((c) => c.path)).toEqual(["/api/session/claim-token", "/api/auth/login", "/api/session/claim"]);
    expect(calls[0].auth).toBe("Bearer anon");
    expect(calls[2].auth).toBe("Bearer acc");
    expect(result).toMatchObject({ outcome: "ok", draft: "moved", caseId: CASE });
    expect((await getSession())?.accessToken).toBe("acc");
  });

  it("claim sendes med samme token som udstedt", async () => {
    let body = "";
    const orig = global.fetch;
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/claim")) body = String(init?.body);
      return (orig as typeof fetch)(url, init);
    }) as typeof fetch;
    await loginKeepingDraft(input, { anonymous: true });
    expect(JSON.parse(body)).toEqual({ claimToken: "x".repeat(64) });
  });

  it("fejler login, ændres intet og der claimes ikke", async () => {
    routes["/api/auth/login"] = () => json(401, { error: { code: "INVALID_CREDENTIALS", message: "x" } });
    await expect(loginKeepingDraft(input, { anonymous: true })).rejects.toThrow("E-mail eller adgangskode er forkert");
    expect(calls.map((c) => c.path)).toEqual(["/api/session/claim-token", "/api/auth/login"]);
    expect((await getSession())?.accessToken).toBe("anon");
  });

  it("netværksfejl ved claim prøves igen med samme token", async () => {
    let n = 0;
    routes["/api/session/claim"] = () => {
      if (++n < 3) throw new Error("net");
      return json(200, { caseId: CASE, moved: true });
    };
    const result = await loginKeepingDraft(input, { anonymous: true });
    expect(calls.filter((c) => c.path === "/api/session/claim")).toHaveLength(3);
    expect(result.draft).toBe("moved");
  });

  it("CLAIM_INVALID: logget ind uden kladden og med dansk tekst, uden gentagelse", async () => {
    routes["/api/session/claim"] = () => json(400, { error: { code: "CLAIM_INVALID", message: "x" } });
    const result = await loginKeepingDraft(input, { anonymous: true });
    expect(result).toMatchObject({ outcome: "ok", draft: "lost", caseId: null });
    expect(result.draftError).toMatch(/tidligere samtale/);
    expect(calls.filter((c) => c.path === "/api/session/claim")).toHaveLength(1);
    expect((await getSession())?.accessToken).toBe("acc");
  });

  it("tom kladde giver 'empty' uden sag", async () => {
    routes["/api/session/claim"] = () => json(200, { caseId: null, moved: false });
    expect(await loginKeepingDraft(input, { anonymous: true })).toMatchObject({ draft: "empty", caseId: null });
  });

  it("en klinik-konto gemmes ikke og der claimes ikke", async () => {
    routes["/api/auth/login"] = () => json(200, { userId: "u", role: "clinic", session: account });
    expect(await loginKeepingDraft(input, { anonymous: true })).toMatchObject({ outcome: "not_patient", draft: "none" });
    expect(calls.map((c) => c.path)).not.toContain("/api/session/claim");
    expect((await getSession())?.accessToken).toBe("anon");
  });

  it("ikke anonym: almindeligt login uden claim-kald", async () => {
    const result = await loginKeepingDraft(input, { anonymous: false });
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/login"]);
    expect(result).toMatchObject({ outcome: "ok", draft: "none" });
  });
});

describe("return-to", () => {
  it("kun hvidlistede stier tillades; alt andet giver standardstien", () => {
    expect(safeReturnTo("/akut")).toBe("/akut");
    expect(safeReturnTo("https://ond.dk")).toBeNull();
    expect(safeReturnTo("//ond.dk")).toBeNull();
    expect(safeReturnTo(["/akut"])).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
    expect(DEFAULT_RETURN_TO).toBe("/konto");
  });
});
