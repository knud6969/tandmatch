import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/server/db/admin";
import { clearAuthCookies } from "@/server/db/supabase";
import { withdrawConsent } from "@/server/models/consents";
import { removeImageObjects } from "@/server/services/images";
import { deleteAccountData } from "@/server/services/accounts";
import type { Session } from "@/server/auth/session";

export type WithdrawResultDto = {
  withdrawnAt: string;
  deletedImages: number;
  sessionDeleted: boolean;
};

// Tilbagetrækning af samtykke (architecture 5.3, 7.7, 10.3). Kun ejeren kan kalde (tjekket i withdraw_consent()).
// image_upload: billedrækkerne slettes i databasen af withdraw_consent(), og filerne ryddes her i samme kald.
// ai_processing i en anonym session: hele sessionen er bygget på det samtykke, så kontoen slettes helt (7.7).
export async function withdrawOwnConsent(
  supabase: SupabaseClient,
  session: Session,
  consentId: string,
): Promise<WithdrawResultDto> {
  const result = await withdrawConsent(supabase, consentId);

  if (result.deletedImagePaths.length > 0) {
    const admin = createSupabaseAdminClient();
    await removeImageObjects(admin, result.deletedImagePaths);
  }

  let sessionDeleted = false;
  if (result.consentType === "ai_processing" && session.isAnonymous) {
    await deleteAccountData(session.userId);
    await clearAuthCookies();
    sessionDeleted = true;
  }

  return {
    withdrawnAt: result.withdrawnAt,
    deletedImages: result.deletedImagePaths.length,
    sessionDeleted,
  };
}
