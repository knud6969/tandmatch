import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const deleteAccount = vi.fn();
vi.mock("@/features/identity/accountDeletionService", () => ({
  AccountDeletionService: class {
    deleteAccount = deleteAccount;
  },
}));

const { ClaimController } = await import("@/features/identity/claimController");

const session = { userId: "patient-1", role: "patient" as const, isAnonymous: false, lastActiveAt: "" };

function controller(outcome: { caseId: string | null; moved: boolean; anonId: string | null }) {
  const claims = { claim: vi.fn().mockResolvedValue(outcome), issueToken: vi.fn() };
  const ctl = new ClaimController({} as SupabaseClient, session, {
    claims: claims as never,
    admin: () => ({}) as SupabaseClient,
  });
  return ctl;
}

describe("ClaimController.claim", () => {
  it("sletter den anonyme bruger efter første overdragelse og udleverer aldrig anonId", async () => {
    deleteAccount.mockReset();
    const result = await controller({ caseId: "c1", moved: true, anonId: "anon-1" }).claim("t".repeat(64));
    expect(result).toEqual({ caseId: "c1", moved: true });
    expect(deleteAccount).toHaveBeenCalledWith("anon-1");
  });

  it("sletter ikke ved gentaget claim (intet anonId) eller hvis id'et er patientens eget", async () => {
    deleteAccount.mockReset();
    await controller({ caseId: "c1", moved: true, anonId: null }).claim("t".repeat(64));
    await controller({ caseId: "c1", moved: true, anonId: "patient-1" }).claim("t".repeat(64));
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("overdragelsen består, selvom sletningen af den anonyme bruger fejler", async () => {
    deleteAccount.mockReset().mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(controller({ caseId: null, moved: false, anonId: "anon-1" }).claim("t".repeat(64))).resolves.toEqual({
      caseId: null,
      moved: false,
    });
    spy.mockRestore();
  });
});
