import "server-only";
import type { ClaimResultDto, ClaimTokenDto } from "@/lib/identity/types/session";
import { ApiError, forbidden, unauthenticated } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";

type IssueRow = { token: string; expires_at: string };
type ClaimRow = { case_id: string | null; moved: boolean; already_claimed: boolean; anon_id?: string };

// Resultatet af en overdragelse. `anonId` er kun sat første gang (til sletning af den anonyme bruger) og må aldrig sendes til klienten.
export type ClaimOutcome = ClaimResultDto & { anonId: string | null };

// Overdragelse af en anonym kladde til en patientkonto (architecture 7.7, 10.2). Brugerens JWT: databasefunktionerne
// issue_claim_token() og claim_anonymous_case() tjekker selv, hvem der kalder, og flytter alt i én transaktion.
export class ClaimRepository extends BaseRepository {
  private readonly errors = () => ({
    UNAUTHENTICATED: unauthenticated(),
    FORBIDDEN: forbidden(),
    NOT_ANONYMOUS: new ApiError(403, "NOT_ANONYMOUS", "Der er ingen anonym samtale at overføre."),
    ACCOUNT_REQUIRED: new ApiError(403, "ACCOUNT_REQUIRED", "Log ind på din konto for at overføre samtalen."),
    CLAIM_INVALID: new ApiError(
      400,
      "CLAIM_INVALID",
      "Din tidligere samtale kunne ikke hentes over på kontoen. Den kan være udløbet eller allerede overført.",
    ),
  });

  // Kaldes af den anonyme bruger. Tokenet vises kun her; databasen gemmer kun et hash.
  async issueToken(): Promise<ClaimTokenDto> {
    const row = this.requireRow(await this.rpc<IssueRow>("issue_claim_token", undefined, this.errors()));
    return { claimToken: row.token, expiresAt: row.expires_at };
  }

  // Kaldes af den indloggede patient.
  async claim(claimToken: string): Promise<ClaimOutcome> {
    const row = this.requireRow(await this.rpc<ClaimRow>("claim_anonymous_case", { p_token: claimToken }, this.errors()));
    return { caseId: row.case_id, moved: row.moved, anonId: row.already_claimed ? null : (row.anon_id ?? null) };
  }
}
