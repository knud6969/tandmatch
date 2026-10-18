import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEANUP_BATCH_SIZE } from "@/lib/constants/limits";
import { ANONYMOUS_SESSION_HOURS } from "@/lib/constants/sessions";
import { lazyAdminClient } from "@/models/db/admin";
import { BookingsRepository } from "@/models/bookingsRepository";
import { CleanupRepository } from "@/models/cleanupRepository";
import { AccountDeletionService } from "@/services/accountDeletionService";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type CronDeps = {
  admin: () => SupabaseClient;
  cleanup: CleanupRepository;
  deletion: AccountDeletionService;
  bookings: BookingsRepository;
};

// Planlagte jobs (architecture 2.3 g). Routen har godkendt CRON_SECRET, før controlleren oprettes.
// Ingen session og ingen brugerklient: kun service role-klienten. Ingen persondata i svar eller logs.
export class CronController {
  private readonly cleanup: CleanupRepository;
  private readonly deletion: AccountDeletionService;
  private readonly bookings: BookingsRepository;

  constructor(deps: Partial<CronDeps> = {}) {
    const admin = deps.admin ?? lazyAdminClient();
    // 2.3 (g): oprydning af anonyme sessioner.
    this.cleanup = deps.cleanup ?? new CleanupRepository(admin());
    this.deletion = deps.deletion ?? new AccountDeletionService(admin());
    // 2.3 (g): complete_due_bookings() er kun til service role.
    this.bookings = deps.bookings ?? new BookingsRepository(admin());
  }

  // Sletter anonyme sessioner 48 timer efter sidste aktivitet: billedmapperne {case_id}/ og auth-brugeren (7.7).
  async cleanupAnonymous(): Promise<{ deletedSessions: number }> {
    const cutoff = new Date(Date.now() - ANONYMOUS_SESSION_HOURS * 60 * 60 * 1000).toISOString();
    const ids = await this.cleanup.listExpiredAnonymousUserIds(cutoff, CLEANUP_BATCH_SIZE);

    let deleted = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await this.deletion.deleteAccount(id);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      console.error(`cleanup-anonymous: ${failed} sessioner kunne ikke slettes`);
    }
    return { deletedSessions: deleted };
  }

  // Skriver den effektive status ned: booked, hvis ends_at + 24 timer er passeret, bliver completed, og udløbne
  // reservationer bliver cancelled (architecture 5.3). Reglerne læser den effektive status, så intet afhænger af jobbet.
  async completeBookings(): Promise<{ completed: number; releasedHolds: number }> {
    return this.bookings.completeDue();
  }
}
