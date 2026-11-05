import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEANUP_BATCH_SIZE, MESSAGE_IMAGE_RETENTION_MONTHS, STORAGE_CLEANUP_BATCH_SIZE } from "@/lib/common/constants/limits";
import { ANONYMOUS_SESSION_HOURS } from "@/lib/identity/constants/sessions";
import { lazyAdminClient } from "@/platform/db/admin";
import { BookingsRepository } from "@/features/booking";
import { CleanupRepository } from "@/platform/cleanupRepository";
import { AccountDeletionService } from "@/features/identity";
import { MessageImagesRepository } from "@/features/leads";
import { StorageCleanupService } from "@/platform/storageCleanupService";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type CronDeps = {
  admin: () => SupabaseClient;
  cleanup: CleanupRepository;
  deletion: AccountDeletionService;
  bookings: BookingsRepository;
  messageImages: MessageImagesRepository;
  storage: StorageCleanupService;
};

// Planlagte jobs (architecture 2.3 g). Routen har godkendt CRON_SECRET, før controlleren oprettes.
// Ingen session og ingen brugerklient: kun service role-klienten. Ingen persondata i svar eller logs.
export class CronController {
  private readonly cleanup: CleanupRepository;
  private readonly deletion: AccountDeletionService;
  private readonly bookings: BookingsRepository;
  private readonly messageImages: MessageImagesRepository;
  private readonly storage: StorageCleanupService;

  constructor(deps: Partial<CronDeps> = {}) {
    const admin = deps.admin ?? lazyAdminClient();
    // 2.3 (g): oprydning af anonyme sessioner.
    this.cleanup = deps.cleanup ?? new CleanupRepository(admin());
    this.deletion = deps.deletion ?? new AccountDeletionService(admin());
    // 2.3 (g): complete_due_bookings() er kun til service role.
    this.bookings = deps.bookings ?? new BookingsRepository(admin());
    // 2.3 (g): purge_inactive_message_images() er kun til service role, og køen pending_storage_paths har ingen policies.
    this.messageImages = deps.messageImages ?? new MessageImagesRepository(admin());
    this.storage = deps.storage ?? new StorageCleanupService(admin());
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

  // Opbevaring og oprydning af filer (security M3 og M4): sletter beskedbilleder 12 måneder efter sidste aktivitet i tråden
  // (triggeren lægger stierne i køen) og tømmer derefter køen pending_storage_paths. Ingen persondata i svaret.
  async cleanupStorage(): Promise<{ purgedMessageImages: number; removed: number; failed: number }> {
    const purgedMessageImages = await this.messageImages.purgeInactive(MESSAGE_IMAGE_RETENTION_MONTHS);
    const { removed, failed } = await this.storage.drain(STORAGE_CLEANUP_BATCH_SIZE);
    if (failed > 0) console.error(`cleanup-storage: ${failed} filer kunne ikke slettes`);
    return { purgedMessageImages, removed, failed };
  }
}
