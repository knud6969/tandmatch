import { isValidCronRequest } from "@/server/auth/cron";
import { CLEANUP_BATCH_SIZE } from "@/lib/constants/limits";
import { ApiError, jsonResponse, withApi } from "@/server/http/api";
import { createSupabaseAdminClient } from "@/server/db/admin";
import { listExpiredAnonymousUserIds } from "@/server/models/cleanup";
import { deleteAccountData } from "@/server/services/accounts";

// Sletter anonyme sessioner 48 timer efter sidste aktivitet (architecture 7.7).
// Beskyttet med CRON_SECRET i Authorization-headeren. Ingen persondata i svar eller logs.
export const POST = withApi(async (req) => {
  if (!isValidCronRequest(req.headers.get("authorization"))) {
    throw new ApiError(401, "UNAUTHORIZED", "Ikke autoriseret.");
  }

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
  return jsonResponse({ deletedSessions: deleted });
});

// Vercel Cron kalder med GET. Samme beskyttelse (CRON_SECRET) som POST.
export const GET = POST;
