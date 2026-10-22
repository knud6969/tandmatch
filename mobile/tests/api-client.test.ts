import { apiErrorText } from "@/lib/common/domain/errors";
import { ApiRequestError, apiRequest } from "~/api/client";
import { getSession, getTermsToken, saveSession, saveTermsToken } from "~/auth/tokens";

// Klientens kald mod /api/*: headers, token-fornyelse og fejl (architecture 13.3). fetch og SecureStore er mocket.
// In-memory SecureStore.
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

type Call = { url: string; init: RequestInit; headers: Record<string, string> };
const calls: Call[] = [];
let handler: (call: Call) => Response | Promise<Response>;
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const error = (status: number, code: string, message = "") => json(status, { error: { code, message } });
const inOneHour = () => new Date(Date.now() + 3600_000).toISOString();
const session = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresAt: inOneHour() });
const refreshCalls = () => calls.filter((c) => c.url.endsWith("/api/auth/refresh"));

beforeEach(async () => {
  mockStore.clear();
  calls.length = 0;
  process.env.EXPO_PUBLIC_API_URL = "http://api.test/";
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  await saveTermsToken("terms-token");
});

// Sikrer, at hvert kald bærer klient-, vilkårs- og bearer-header, og at 204 giver undefined.
describe("headers", () => {
  it("sender klient-, vilkårs- og bearer-header og parser JSON", async () => {
    await saveSession(session(1));
    handler = () => json(200, { ok: true });
    await expect(apiRequest("/api/me")).resolves.toEqual({ ok: true });
    expect(calls[0].url).toBe("http://api.test/api/me");
    expect(calls[0].headers).toMatchObject({
      "X-TandMatch-Client": "mobile",
      "X-Terms-Token": "terms-token",
      Authorization: "Bearer access-1",
    });
  });

  it("sender ingen Authorization uden session og JSON-body med Content-Type", async () => {
    handler = () => json(201, { id: "x" });
    await apiRequest("/api/cases", { method: "POST", json: { a: 1 } });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(calls[0].init.body).toBe('{"a":1}');
    expect(calls[0].init.method).toBe("POST");
  });

  it("returnerer undefined ved 204", async () => {
    handler = () => json(204);
    await expect(apiRequest("/api/x", { method: "DELETE" })).resolves.toBeUndefined();
  });
});

// Sikrer, at tokens fornyes præcis én gang (også ved samtidige kald), og at kun en afvisning (401) logger ud.
describe("fornyelse", () => {
  it("401 UNAUTHENTICATED giver fornyelse og ét nyt forsøg med det nye token", async () => {
    await saveSession(session(1));
    handler = (call) => {
      if (call.url.endsWith("/api/auth/refresh")) return json(200, { session: session(2) });
      return call.headers.Authorization === "Bearer access-2" ? json(200, { ok: true }) : error(401, "UNAUTHENTICATED");
    };
    await expect(apiRequest("/api/me")).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url.replace("http://api.test", ""))).toEqual(["/api/me", "/api/auth/refresh", "/api/me"]);
    expect(JSON.parse(String(refreshCalls()[0].init.body))).toEqual({ refreshToken: "refresh-1" });
    expect((await getSession())?.accessToken).toBe("access-2");
  });

  it("forsøger kun én gang mere, hvis kaldet stadig er 401", async () => {
    await saveSession(session(1));
    handler = (call) => (call.url.endsWith("/api/auth/refresh") ? json(200, { session: session(2) }) : error(401, "UNAUTHENTICATED"));
    await expect(apiRequest("/api/me")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(calls.filter((c) => c.url.endsWith("/api/me"))).toHaveLength(2);
    expect(refreshCalls()).toHaveLength(1);
  });

  it("samtidige 401 giver kun ét refresh-kald", async () => {
    await saveSession(session(1));
    handler = async (call) => {
      if (call.url.endsWith("/api/auth/refresh")) {
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { session: session(2) });
      }
      return call.headers.Authorization === "Bearer access-2" ? json(200, { ok: true }) : error(401, "UNAUTHENTICATED");
    };
    const results = await Promise.all([apiRequest("/api/a"), apiRequest("/api/b"), apiRequest("/api/c")]);
    expect(results).toHaveLength(3);
    expect(refreshCalls()).toHaveLength(1);
  });

  it("fornyer før kaldet, når tokenet udløber inden for 60 sekunder", async () => {
    await saveSession({ ...session(1), expiresAt: new Date(Date.now() + 30_000).toISOString() });
    handler = (call) => (call.url.endsWith("/api/auth/refresh") ? json(200, { session: session(2) }) : json(200, { ok: true }));
    await apiRequest("/api/me");
    expect(calls[0].url).toContain("/api/auth/refresh");
    expect(calls[1].headers.Authorization).toBe("Bearer access-2");
  });

  it("slettter tokens, når fornyelsen afvises med 401", async () => {
    await saveSession(session(1));
    handler = (call) => (call.url.endsWith("/api/auth/refresh") ? error(401, "UNAUTHENTICATED") : error(401, "UNAUTHENTICATED"));
    await expect(apiRequest("/api/me")).rejects.toMatchObject({ status: 401 });
    expect(await getSession()).toBeNull();
  });

  it("503 AUTH_UNAVAILABLE ved fornyelse er ikke logud", async () => {
    await saveSession(session(1));
    handler = (call) => (call.url.endsWith("/api/auth/refresh") ? error(503, "AUTH_UNAVAILABLE") : error(401, "UNAUTHENTICATED"));
    await expect(apiRequest("/api/me")).rejects.toMatchObject({ status: 503, code: "AUTH_UNAVAILABLE" });
    expect((await getSession())?.refreshToken).toBe("refresh-1");
  });

  it("forsøger ikke at forny uden session", async () => {
    handler = () => error(401, "UNAUTHENTICATED");
    await expect(apiRequest("/api/me")).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls()).toHaveLength(0);
  });
});

// Sikrer, at fejl bliver til ApiRequestError med dansk tekst, og at manglende vilkår nulstilles.
describe("fejl", () => {
  it("TERMS_REQUIRED fjerner vilkårstokenet og giver dansk tekst", async () => {
    handler = () => error(403, "TERMS_REQUIRED", "Terms required");
    const err = await apiRequest("/api/cases").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 403, code: "TERMS_REQUIRED", message: apiErrorText("TERMS_REQUIRED", "Terms required") });
    expect(await getTermsToken()).toBeNull();
  });

  it("fejltekster kommer fra apiErrorText (kendt kode, dansk servertekst, engelsk servertekst)", async () => {
    handler = () => error(409, "SOMETHING_ELSE", "Tiden er desværre taget.");
    await expect(apiRequest("/api/x")).rejects.toThrow("Tiden er desværre taget.");
    handler = () => error(400, "VALIDATION", "Invalid input: expected string");
    await expect(apiRequest("/api/x")).rejects.toThrow(apiErrorText("VALIDATION", "Invalid input: expected string"));
  });

  it("netværksfejl giver ApiRequestError med koden NETWORK", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as typeof fetch;
    await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 0, code: "NETWORK", message: apiErrorText("NETWORK", "") });
  });

  it("svar uden JSON giver UNKNOWN", async () => {
    handler = () => new Response("<html>", { status: 502 });
    await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 502, code: "UNKNOWN" });
  });
});
