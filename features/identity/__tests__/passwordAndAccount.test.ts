import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// server-only kaster uden for Next.js' server-bundle; i enhedstest erstattes den af en tom modul.
vi.mock("server-only", () => ({}));

const { PasswordController, hasRecentRecovery } = await import("@/features/identity/passwordController");
const { AccountController } = await import("@/features/identity/accountController");
const { ApiError } = await import("@/platform/middleware/http");
const { forgotPasswordSchema, passwordRecoverySchema, changePasswordSchema, resetPasswordSchema } = await import(
  "@/lib/identity/schemas/auth"
);
type AuthRepository = import("@/features/identity/authRepository").AuthRepository;

const db = {} as SupabaseClient;
const NOW = new Date("2026-10-24T12:00:00Z");
const secondsAgo = (s: number) => NOW.getTime() / 1000 - s;

function fakeAuth(overrides: Partial<Record<keyof AuthRepository, unknown>> = {}) {
  return {
    requestPasswordReset: vi.fn().mockResolvedValue(true),
    startRecoverySession: vi.fn().mockResolvedValue(undefined),
    authMethods: vi.fn().mockResolvedValue([]),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    signOutLocal: vi.fn().mockResolvedValue(undefined),
    currentEmail: vi.fn().mockResolvedValue("klinik@example.com"),
    requestEmailChange: vi.fn().mockResolvedValue("sent"),
    signInWithPassword: vi.fn().mockResolvedValue({ userId: "u1", session: null }),
    ...overrides,
  } as unknown as AuthRepository & Record<string, ReturnType<typeof vi.fn>>;
}

describe("hasRecentRecovery", () => {
  it("godtager otp/recovery inden for 15 minutter", () => {
    expect(hasRecentRecovery([{ method: "otp", timestamp: secondsAgo(60) }], NOW)).toBe(true);
    expect(hasRecentRecovery([{ method: "recovery", timestamp: secondsAgo(14 * 60) }], NOW)).toBe(true);
  });
  it("afviser almindelig login, for gamle links og tom amr", () => {
    expect(hasRecentRecovery([{ method: "password", timestamp: secondsAgo(10) }], NOW)).toBe(false);
    expect(hasRecentRecovery([{ method: "otp", timestamp: secondsAgo(16 * 60) }], NOW)).toBe(false);
    expect(hasRecentRecovery([], NOW)).toBe(false);
  });
});

describe("PasswordController", () => {
  it("forgot kaster aldrig og logger uden e-mail, når Supabase afviser", async () => {
    const auth = fakeAuth({ requestPasswordReset: vi.fn().mockResolvedValue(false) });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(new PasswordController(db, { auth }).forgot({ email: "x@example.com" }, "http://a/nulstil-adgangskode")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("x@example.com");
    log.mockRestore();
  });

  it("reset uden frisk recovery-session giver 403 RECOVERY_REQUIRED og ændrer intet", async () => {
    const auth = fakeAuth({ authMethods: vi.fn().mockResolvedValue([{ method: "password", timestamp: secondsAgo(5) }]) });
    await expect(new PasswordController(db, { auth }).reset({ password: "ny-kode-1234" }, NOW)).rejects.toMatchObject({
      status: 403,
      code: "RECOVERY_REQUIRED",
    });
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it("reset med recovery-session sætter adgangskoden og logger alle sessioner ud", async () => {
    const auth = fakeAuth({ authMethods: vi.fn().mockResolvedValue([{ method: "otp", timestamp: secondsAgo(30) }]) });
    await new PasswordController(db, { auth }).reset({ password: "ny-kode-1234" }, NOW);
    expect(auth.updatePassword).toHaveBeenCalledWith("ny-kode-1234");
    expect(auth.signOut).toHaveBeenCalledWith("global");
  });
});

describe("AccountController", () => {
  const invalidCredentials = () => new ApiError(401, "INVALID_CREDENTIALS", "x");

  it("forkert nuværende adgangskode giver 400 INVALID_CURRENT_PASSWORD (ikke 401)", async () => {
    const verifier = fakeAuth({ signInWithPassword: vi.fn().mockRejectedValue(invalidCredentials()) });
    const auth = fakeAuth();
    const controller = new AccountController(db, { auth, verifier: () => verifier });
    await expect(controller.changePassword({ currentPassword: "forkert-1", newPassword: "ny-kode-1234" })).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CURRENT_PASSWORD",
    });
    await expect(controller.changeEmail({ email: "ny@example.com", currentPassword: "forkert-1" }, "http://a/login")).rejects.toMatchObject({
      code: "INVALID_CURRENT_PASSWORD",
    });
    expect(auth.updatePassword).not.toHaveBeenCalled();
    expect(auth.requestEmailChange).not.toHaveBeenCalled();
  });

  it("skift af adgangskode tjekker med den separate klient, logger den ud og logger andre sessioner ud", async () => {
    const verifier = fakeAuth();
    const auth = fakeAuth();
    await new AccountController(db, { auth, verifier: () => verifier }).changePassword({ currentPassword: "gammel-123", newPassword: "ny-kode-1234" });
    expect(verifier.signInWithPassword).toHaveBeenCalledWith("klinik@example.com", "gammel-123");
    expect(verifier.signOutLocal).toHaveBeenCalled();
    expect(auth.updatePassword).toHaveBeenCalledWith("ny-kode-1234");
    expect(auth.signOut).toHaveBeenCalledWith("others");
  });

  it("samme adgangskode og samme e-mail afvises uden at tjekke adgangskoden", async () => {
    const verifier = fakeAuth();
    const controller = new AccountController(db, { auth: fakeAuth(), verifier: () => verifier });
    await expect(controller.changePassword({ currentPassword: "samme-123", newPassword: "samme-123" })).rejects.toMatchObject({ code: "SAME_PASSWORD" });
    await expect(controller.changeEmail({ email: "klinik@example.com", currentPassword: "x" }, "http://a/login")).rejects.toMatchObject({ code: "SAME_EMAIL" });
    expect(verifier.signInWithPassword).not.toHaveBeenCalled();
  });

  it("skift af e-mail svarer ens, om adressen er i brug eller ej", async () => {
    for (const outcome of ["sent", "exists"]) {
      const auth = fakeAuth({ requestEmailChange: vi.fn().mockResolvedValue(outcome) });
      await expect(
        new AccountController(db, { auth, verifier: () => fakeAuth() }).changeEmail({ email: "ny@example.com", currentPassword: "k" }, "http://a/login?besked=email-bekraeftet"),
      ).resolves.toBeUndefined();
      expect(auth.requestEmailChange).toHaveBeenCalledWith("ny@example.com", "http://a/login?besked=email-bekraeftet");
    }
  });

  it("uden session giver 401", async () => {
    const auth = fakeAuth({ currentEmail: vi.fn().mockResolvedValue(null) });
    await expect(new AccountController(db, { auth }).get()).rejects.toMatchObject({ status: 401 });
  });
});

describe("skemaer", () => {
  it("glemt adgangskode afviser en redirect fra klienten", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "a@example.com", redirectTo: "https://evil.example" }).success).toBe(false);
  });
  it("recovery kræver præcis én af code og tokenHash", () => {
    expect(passwordRecoverySchema.safeParse({ code: "abcdefgh12" }).success).toBe(true);
    expect(passwordRecoverySchema.safeParse({ tokenHash: "abcdefgh12" }).success).toBe(true);
    expect(passwordRecoverySchema.safeParse({ code: "abcdefgh12", tokenHash: "abcdefgh12" }).success).toBe(false);
    expect(passwordRecoverySchema.safeParse({}).success).toBe(false);
  });
  it("ny adgangskode har samme krav som ved oprettelse", () => {
    expect(resetPasswordSchema.safeParse({ password: "kort" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "a".repeat(73) }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "lang-nok-1" }).success).toBe(true);
  });
});
