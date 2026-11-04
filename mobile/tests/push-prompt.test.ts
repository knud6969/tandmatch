import { logout } from "~/api/auth";
import { getPushFlag, getPushToken, savePushToken, saveSession, saveTermsToken, setPushFlag } from "~/auth/tokens";
import { shouldShowPushPrompt } from "~/utils/push-prompt";

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

const base = { permission: "undetermined", dismissed: false, hasProjectId: true, hasAccount: true } as const;

describe("shouldShowPushPrompt", () => {
  it("vises kun, når tilladelsen ikke er afgjort og patienten ikke har valgt Ikke nu", () => {
    expect(shouldShowPushPrompt(base)).toBe(true);
    expect(shouldShowPushPrompt({ ...base, permission: "granted" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: "denied" })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, permission: null })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, dismissed: true })).toBe(false);
  });

  it("vises ikke uden projekt-id eller uden konto", () => {
    expect(shouldShowPushPrompt({ ...base, hasProjectId: false })).toBe(false);
    expect(shouldShowPushPrompt({ ...base, hasAccount: false })).toBe(false);
  });
});

describe("logud og push", () => {
  let calls: { url: string; method: string; body: string | null }[];

  beforeEach(async () => {
    mockStore.clear();
    calls = [];
    process.env.EXPO_PUBLIC_API_URL = "http://api.test";
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: (init?.body as string | undefined) ?? null });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    await saveTermsToken("t");
    await saveSession({ accessToken: "a1", refreshToken: "r1", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  });

  it("kalder DELETE /api/push-tokens før logout og sletter det gemte token", async () => {
    await savePushToken("ExponentPushToken[abcdefgh12345678]");
    await setPushFlag("disabled", true);
    await logout();
    expect(calls.map((c) => `${c.method} ${c.url.replace("http://api.test", "")}`)).toEqual(["DELETE /api/push-tokens", "POST /api/auth/logout"]);
    expect(JSON.parse(calls[0].body ?? "{}")).toEqual({ token: "ExponentPushToken[abcdefgh12345678]" });
    expect(await getPushToken()).toBeNull();
    expect(await getPushFlag("disabled")).toBe(false);
  });

  it("logger ud, selv om afmeldingen fejler, og uden token kaldes DELETE ikke", async () => {
    await logout();
    expect(calls.map((c) => c.method)).toEqual(["POST"]);
    calls = [];
    await saveSession({ accessToken: "a2", refreshToken: "r2", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    await savePushToken("ExponentPushToken[abcdefgh12345678]");
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: null });
      return String(url).includes("push-tokens") ? new Response(JSON.stringify({ error: { code: "INTERNAL", message: "x" } }), { status: 500 }) : new Response(null, { status: 204 });
    }) as typeof fetch;
    await logout();
    expect(calls.at(-1)?.url).toContain("/api/auth/logout");
  });
});
