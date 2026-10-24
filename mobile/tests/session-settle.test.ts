import { clearSession, saveSession, subscribeAuthChange } from "~/auth/tokens";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStore.delete(key)),
}));

const session = { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3600_000).toISOString() };

// Login, opret og logud venter på, at SessionProvider har hentet status, så næste skærm aldrig ser den gamle.
describe("settle", () => {
  it("saveSession og clearSession med settle venter på lytterne", async () => {
    let done = 0;
    const off = subscribeAuthChange(async () => {
      await new Promise((r) => setTimeout(r, 10));
      done += 1;
    });
    await saveSession(session, { settle: true });
    expect(done).toBe(1);
    await clearSession({ settle: true });
    expect(done).toBe(2);
    off();
  });

  it("uden settle returnerer saveSession uden at vente (bruges af fornyelse)", async () => {
    let done = 0;
    const off = subscribeAuthChange(async () => {
      await new Promise((r) => setTimeout(r, 10));
      done += 1;
    });
    await saveSession(session);
    expect(done).toBe(0);
    off();
  });
});
