import "server-only";
import { CLEANUP_BATCH_SIZE } from "@/lib/constants/limits";
import { createSupabaseAdminClient } from "@/models/db/admin";
import { listExpiredAnonymousUserIds } from "@/models/cleanupModel";
import { deleteAccountData } from "@/services/accountDeletion";

// Sletter anonyme sessioner 48 timer efter sidste aktivitet (architecture 7.7).
// Ingen persondata i svar eller logs.
export async function cleanupAnonymousSessions(): Promise<{ deletedSessions: number }> {
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const ids = await listExpiredAnonymousUserIds(admin, cutoff, CLEANUP_BATCH_SIZE);

  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await deleteAccountData(id);
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
