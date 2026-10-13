import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// server-only kaster uden for Next.js' server-bundle; i enhedstest erstattes den af en tom modul.
vi.mock("server-only", () => ({}));

const { AuthRepository } = await import("@/models/authRepository");

function clientReturning(...results: Array<{ user: { id: string } | null; error: { name?: string; status?: number } | null }>) {
  const getUser = vi.fn();
  for (const r of results) getUser.mockResolvedValueOnce({ data: { user: r.user }, error: r.error });
  return { client: { auth: { getUser } } as unknown as SupabaseClient, getUser };
}

describe("AuthRepository.findUserId", () => {
  it("returnerer brugerens id", async () => {
    const { client } = clientReturning({ user: { id: "u1" }, error: null });
    expect(await new AuthRepository(client).findUserId()).toBe("u1");
  });

  it("returnerer null uden session eller med afvist session (ikke et retry)", async () => {
    const { client, getUser } = clientReturning({ user: null, error: { name: "AuthSessionMissingError", status: 400 } });
    expect(await new AuthRepository(client).findUserId()).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
    const rejected = clientReturning({ user: null, error: { name: "AuthApiError", status: 403 } });
    expect(await new AuthRepository(rejected.client).findUserId()).toBeNull();
  });

  it("prøver igen ved midlertidig fejl og lykkes", async () => {
    const { client, getUser } = clientReturning(
      { user: null, error: { name: "AuthApiError", status: 500 } },
      { user: null, error: { name: "AuthRetryableFetchError", status: 0 } },
      { user: { id: "u2" }, error: null },
    );
    expect(await new AuthRepository(client).findUserId()).toBe("u2");
    expect(getUser).toHaveBeenCalledTimes(3);
  });

  it("giver 503 AUTH_UNAVAILABLE (aldrig null/401), når Auth bliver ved med at fejle", async () => {
    const down = { user: null, error: { name: "AuthRetryableFetchError", status: 0 } };
    const { client } = clientReturning(down, down, down);
    await expect(new AuthRepository(client).findUserId()).rejects.toMatchObject({ status: 503, code: "AUTH_UNAVAILABLE" });
  });
});
