import { CLINIC_ON_WEB_MESSAGE } from "~/auth/session-context";
import { convertAnonymous, login, logout, signupPatient } from "~/api/auth";
import { getSession, saveSession, saveTermsToken } from "~/auth/tokens";

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
jest.mock("~/auth/session-context", () => ({ CLINIC_ON_WEB_MESSAGE: "Klinikker logger ind på TandMatch på weben." }));

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const session = { accessToken: "a1", refreshToken: "r1", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
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

describe("auth-API", () => {
  it("login med patient gemmer sessionen", async () => {
    respond = () => json(200, { userId: "u", role: "patient", session });
    await expect(login({ email: "a@b.dk", password: "x" })).resolves.toBe("ok");
    expect((await getSession())?.accessToken).toBe("a1");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: "a@b.dk", password: "x" });
  });

  it("login med klinik-konto gemmer intet og afvises", async () => {
    respond = () => json(200, { userId: "u", role: "clinic", session });
    await expect(login({ email: "a@b.dk", password: "x" })).resolves.toBe("not_patient");
    expect(await getSession()).toBeNull();
    expect(CLINIC_ON_WEB_MESSAGE).toMatch(/weben/);
  });

  it("forkert adgangskode giver den danske tekst", async () => {
    respond = () => json(401, { error: { code: "INVALID_CREDENTIALS", message: "x" } });
    await expect(login({ email: "a@b.dk", password: "x" })).rejects.toThrow("E-mail eller adgangskode er forkert");
  });

  it("opret konto og konverter gemmer sessionen", async () => {
    respond = () => json(201, { userId: "u", role: "patient", session });
    await signupPatient({ role: "patient", email: "a@b.dk", password: "12345678", firstName: "Ane" });
    expect(calls[0].url).toBe("http://api.test/api/auth/signup");
    mockStore.clear();
    await saveTermsToken("t");
    respond = () => json(200, { userId: "u", role: "patient", session });
    await convertAnonymous({ email: "a@b.dk", password: "12345678", firstName: "Ane" });
    expect(calls[1].url).toBe("http://api.test/api/auth/convert");
    expect(await getSession()).not.toBeNull();
  });

  it("log ud sletter tokens lokalt, også når kaldet fejler", async () => {
    await saveSession(session);
    respond = () => json(500, { error: { code: "INTERNAL", message: "" } });
    await expect(logout()).rejects.toBeDefined();
    expect(await getSession()).toBeNull();
  });
});
