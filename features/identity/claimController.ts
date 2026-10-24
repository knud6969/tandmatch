import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimResultDto, ClaimTokenDto } from "@/lib/identity/types/session";
import type { Session } from "@/platform/middleware/session";
import { lazyAdminClient } from "@/platform/db/admin";
import { AccountDeletionService } from "@/features/identity/accountDeletionService";
import { ClaimRepository } from "@/features/identity/claimRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ClaimDeps = { claims: ClaimRepository; admin: () => SupabaseClient };

// Overdragelse af anonym kladde til en eksisterende konto (architecture 7.7, 10.2). Routerne har sikret rollerne
// (anonym til udstedelse, patient med konto til overdragelse); databasefunktionerne tjekker det igen.
export class ClaimController {
  private readonly claims: ClaimRepository;
  // Service role-klienten (architecture 2.3 f): kun til at slette den anonyme bruger efter overdragelsen.
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<ClaimDeps> = {},
  ) {
    this.claims = deps.claims ?? new ClaimRepository(supabase);
    this.admin = deps.admin ?? lazyAdminClient();
  }

  // Den anonyme session udstedte engangs-tokenet, før appen loggede ind.
  issueToken(): Promise<ClaimTokenDto> {
    return this.claims.issueToken();
  }

  // Den indloggede patient indløser tokenet. Databasen flytter kladden atomisk; derefter slettes den anonyme bruger
  // (rester som lukkede sager og deres billedmapper). Fejler sletningen, er overdragelsen stadig gennemført og
  // oprydningsjobbet fjerner den anonyme bruger efter 48 timer.
  async claim(claimToken: string): Promise<ClaimResultDto> {
    const { anonId, ...result } = await this.claims.claim(claimToken);
    if (anonId !== null && anonId !== this.session.userId) {
      try {
        // Slet kun, hvis brugeren stadig er anonym: er den gamle session konverteret i mellemtiden, er det en rigtig konto.
        const { data: profile } = await this.admin().from("profiles").select("is_anonymous").eq("id", anonId).maybeSingle();
        if (profile?.is_anonymous !== true) return result;
        // 2.3 (c, f): billedfiler og auth-brugeren for den anonyme bruger (id'et kommer fra databasens claim-svar).
        await new AccountDeletionService(this.admin()).deleteAccount(anonId);
      } catch {
        console.error("claim: sletning af den anonyme bruger fejlede");
      }
    }
    return result;
  }
}
