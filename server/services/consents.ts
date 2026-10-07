import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/server/http/api";
import { createSupabaseAdminClient } from "@/server/db/admin";
import { clearAuthCookies } from "@/server/db/supabase";
import { confirmConsentCleanup, withdrawConsent } from "@/server/models/consents";
import { removeImageObjects } from "@/server/services/images";
import { deleteAccountData } from "@/server/services/accounts";
import type { Session } from "@/server/auth/session";

export type WithdrawResultDto = {
  withdrawnAt: string;
  deletedImages: number;
  sessionDeleted: boolean;
};

// Tilbagetrækning af samtykke (architecture 5.3, 7.7, 10.3). Kun ejeren kan kalde (tjekket i withdraw_consent()).
// withdraw_consent() markerer withdrawn_at og sletter billedrækker/lukker AI-samtaler i databasen, men gemmer
// også et oprydnings-flag (cleanup_done) og de slettede filstier. Fejler oprydningen her (storage eller
// kontosletning), kastes en tydelig fejl, og et NYT forsøg på denne route kalder withdraw_consent() igen,
// som - fordi cleanup_done stadig er false - gentager den samme oprydning i stedet for at svare ALREADY_WITHDRAWN.
export async function withdrawOwnConsent(
  supabase: SupabaseClient,
  session: Session,
  consentId: string,
): Promise<WithdrawResultDto> {
  const result = await withdrawConsent(supabase, consentId);

  if (result.deletedImagePaths.length > 0) {
    try {
      const admin = createSupabaseAdminClient();
      await removeImageObjects(admin, result.deletedImagePaths);
      await confirmConsentCleanup(supabase, consentId);
    } catch (err) {
      // Ingen persondata logges, kun fejltypen. Samtykket er allerede trukket tilbage; prøv igen for at rydde filerne.
      console.error("withdraw_consent: oprydning af billedfiler fejlede:", err instanceof Error ? err.name : "ukendt");
      throw new ApiError(
        500,
        "CLEANUP_FAILED",
        "Samtykket er trukket tilbage, men billederne kunne ikke ryddes. Prøv at trække samtykket tilbage igen.",
      );
    }
  }

  let sessionDeleted = false;
  if (result.consentType === "ai_processing" && session.isAnonymous) {
    try {
      await deleteAccountData(session.userId);
      await clearAuthCookies();
      sessionDeleted = true;
    } catch (err) {
      console.error("withdraw_consent: sletning af anonym konto fejlede:", err instanceof Error ? err.name : "ukendt");
      throw new ApiError(
        500,
        "CLEANUP_FAILED",
        "Samtykket er trukket tilbage, men sessionen kunne ikke slettes endnu. Prøv at trække samtykket tilbage igen.",
      );
    }
  }

  return {
    withdrawnAt: result.withdrawnAt,
    deletedImages: result.deletedImagePaths.length,
    sessionDeleted,
  };
}
