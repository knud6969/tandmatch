import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import type { ConsentType } from "@/lib/common/types/common";
import type { ConsentDto, GrantedConsentDto, WithdrawResultDto } from "@/lib/types/consents";
import { ApiError } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { CaseImageStorage } from "@/models/caseImageStorage";
import { ConsentsRepository } from "@/models/consentsRepository";
import { lazyAdminClient } from "@/platform/db/admin";
import { AccountDeletionService } from "@/services/accountDeletionService";

type GrantConsentInput = { type: ConsentType; textVersion: string };

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ConsentsDeps = { consents: ConsentsRepository; admin: () => SupabaseClient };

// Samtykker (GDPR art. 9). Vilkårs-accept er IKKE et samtykke (architecture 2.5, 10.3).
export class ConsentsController {
  private readonly consents: ConsentsRepository;
  // Service role-klienten (architecture 2.3, 2.1.1). Gives kun videre til storage og sletning, med formål.
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<ConsentsDeps> = {},
  ) {
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    this.admin = deps.admin ?? lazyAdminClient();
  }

  // Egne samtykker, også tilbagetrukne (RLS: kun ejeren).
  listOwn(): Promise<ConsentDto[]> {
    return this.consents.listOwn();
  }

  async grant(input: GrantConsentInput): Promise<GrantedConsentDto> {
    if (input.textVersion !== CONSENT_TEXT_VERSIONS[input.type]) {
      throw new ApiError(400, "CONSENT_VERSION_MISMATCH", "Samtykketeksten er opdateret. Læs den igen og accepter.");
    }
    if (input.type === "health_data_sharing" && this.session.isAnonymous) {
      throw new ApiError(403, "ACCOUNT_REQUIRED", "Opret en konto for at give samtykke til deling med klinikker.");
    }

    const consent = await this.consents.create({
      patientId: this.session.userId,
      type: input.type,
      textVersion: input.textVersion,
      grantedWhileAnonymous: this.session.isAnonymous,
    });
    return { id: consent.id, type: consent.type, grantedAt: consent.grantedAt };
  }

  // Tilbagetrækning (architecture 5.3, 7.7, 10.3). Kun ejeren kan kalde (tjekket i withdraw_consent()).
  // withdraw_consent() markerer withdrawn_at og sletter billedrækker, lukker AI-samtaler og trækker åbne leads
  // tilbage i databasen, men gemmer også et oprydnings-flag (cleanup_done) og de slettede filstier. Fejler
  // oprydningen her (storage eller kontosletning), kastes en tydelig fejl, og et nyt forsøg gentager oprydningen,
  // fordi cleanup_done stadig er false, i stedet for at svare ALREADY_WITHDRAWN.
  async withdraw(consentId: string): Promise<WithdrawResultDto> {
    const result = await this.consents.withdraw(consentId);

    if (result.deletedImagePaths.length > 0) {
      try {
        // 2.3 (c): billedfiler i case-images fjernes efter tilbagetrækning af image_upload.
        await new CaseImageStorage(this.admin()).remove(result.deletedImagePaths);
        await this.consents.confirmCleanup(consentId);
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
    if (result.consentType === "ai_processing" && this.session.isAnonymous) {
      try {
        // 2.3 (c, f): billedfiler og auth-brugeren slettes for den anonyme session.
        await new AccountDeletionService(this.admin()).deleteAccount(this.session.userId);
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
      withdrawnLeads: result.withdrawnLeads,
      sessionDeleted,
    };
  }
}
