import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import type { ConsentType } from "@/lib/types/common";
import type { ConsentDto, GrantedConsentDto, WithdrawResultDto } from "@/lib/types/consents";
import { ApiError } from "@/middleware/http";
import { createSupabaseAdminClient } from "@/models/db/admin";
import { confirmConsentCleanup, insertConsent, listConsents, withdrawConsent } from "@/models/consentsModel";
import { removeImageObjects } from "@/models/cleanupModel";
import { deleteAccountData } from "@/services/accountDeletion";
import type { Session } from "@/middleware/session";

type GrantConsentInput = { type: ConsentType; textVersion: string };

// Egne samtykker, også tilbagetrukne (RLS: kun ejeren).
export async function listOwnConsents(supabase: SupabaseClient): Promise<ConsentDto[]> {
  return listConsents(supabase);
}

// Samtykker (GDPR art. 9). Vilkårs-accept er IKKE et samtykke (architecture 2.5, 10.3).
export async function grantOwnConsent(
  supabase: SupabaseClient,
  session: Session,
  input: GrantConsentInput,
): Promise<GrantedConsentDto> {
  if (input.textVersion !== CONSENT_TEXT_VERSIONS[input.type]) {
    throw new ApiError(400, "CONSENT_VERSION_MISMATCH", "Samtykketeksten er opdateret. Læs den igen og accepter.");
  }
  if (input.type === "health_data_sharing" && session.isAnonymous) {
    throw new ApiError(403, "ACCOUNT_REQUIRED", "Opret en konto for at give samtykke til deling med klinikker.");
  }

  const consent = await insertConsent(supabase, {
    patientId: session.userId,
    type: input.type,
    textVersion: input.textVersion,
    grantedWhileAnonymous: session.isAnonymous,
  });
  return { id: consent.id, type: consent.type, grantedAt: consent.grantedAt };
}

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
