import type { MeDto } from "@/lib/identity/types/auth";
import { deriveSessionStatus, signedInLabel } from "~/utils/session-status";

const me = (patch: Partial<MeDto> = {}): MeDto => ({ id: "u1", role: "patient", isAnonymous: false, displayName: "Mette", anonymousExpiresAt: null, ...patch });

describe("deriveSessionStatus", () => {
  it("er loading, før første hentning er færdig", () => {
    expect(deriveSessionStatus({ ready: false, hasTokens: true, me: null, retryable: false })).toBe("loading");
  });
  it("er none uden tokens eller uden me", () => {
    expect(deriveSessionStatus({ ready: true, hasTokens: false, me: null, retryable: false })).toBe("none");
    expect(deriveSessionStatus({ ready: true, hasTokens: true, me: null, retryable: false })).toBe("none");
  });
  it("skelner anonym session fra konto", () => {
    expect(deriveSessionStatus({ ready: true, hasTokens: true, me: me({ isAnonymous: true }), retryable: false })).toBe("anonymous");
    expect(deriveSessionStatus({ ready: true, hasTokens: true, me: me(), retryable: false })).toBe("account");
  });
  it("er unavailable ved midlertidig fejl, selv med en gammel me", () => {
    expect(deriveSessionStatus({ ready: true, hasTokens: true, me: me(), retryable: true })).toBe("unavailable");
  });
});

describe("signedInLabel", () => {
  it("bruger navnet, ellers en neutral tekst", () => {
    expect(signedInLabel(me())).toBe("Mette");
    expect(signedInLabel(me({ displayName: null }))).toBe("din konto");
  });
});
