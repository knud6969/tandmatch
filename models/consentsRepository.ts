import "server-only";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import type { ConsentDto } from "@/lib/types/consents";
import type { ConsentType } from "@/lib/common/types/common";
import { ApiError, consentRequired, notFound, unauthenticated } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Database, Tables } from "@/platform/db/database.types";

export type NewConsent = {
  patientId: string;
  type: ConsentType;
  textVersion: string;
  grantedWhileAnonymous: boolean;
};

type WithdrawConsentResult = {
  withdrawnAt: string;
  consentType: ConsentType;
  deletedImagePaths: string[];
  closedConversations: number;
  withdrawnLeads: number;
};

type ConsentRow = Pick<
  Tables<"consents">,
  "id" | "type" | "text_version" | "granted_at" | "granted_while_anonymous" | "withdrawn_at"
>;

type WithdrawRow = Database["public"]["Functions"]["withdraw_consent"]["Returns"][number];

const CONSENT_COLUMNS = "id, type, text_version, granted_at, granted_while_anonymous, withdrawn_at";

// Samtykker (architecture 4.3, 10.3). Brugerens JWT: RLS lader kun ejeren se og give samtykker.
export class ConsentsRepository extends BaseRepository<ConsentRow, ConsentDto> {
  protected toDto(row: ConsentRow): ConsentDto {
    return {
      id: row.id,
      type: row.type,
      textVersion: row.text_version,
      grantedAt: row.granted_at,
      grantedWhileAnonymous: row.granted_while_anonymous,
      withdrawnAt: row.withdrawn_at,
    };
  }

  private toInsert(row: NewConsent) {
    return {
      patient_id: row.patientId,
      type: row.type,
      text_version: row.textVersion,
      granted_while_anonymous: row.grantedWhileAnonymous,
    };
  }

  // Flere samtykker indsættes i ét insert, så de enten alle gemmes eller ingen.
  async createMany(rows: NewConsent[]): Promise<void> {
    await this.run(this.db.from("consents").insert(rows.map((row) => this.toInsert(row))), "consents: insert fejlede");
  }

  async create(row: NewConsent): Promise<ConsentDto> {
    const data = await this.run(
      this.db.from("consents").insert(this.toInsert(row)).select(CONSENT_COLUMNS).single(),
      "consents: insert fejlede",
    );
    return this.toDto(this.requireRow(data));
  }

  // Egne samtykker, også tilbagetrukne.
  async listOwn(): Promise<ConsentDto[]> {
    return this.toDtos(
      await this.runList(
        this.db.from("consents").select(CONSENT_COLUMNS).order("granted_at", { ascending: false }),
        "consents: list fejlede",
      ),
    );
  }

  // Aktivt samtykke: seneste række uden tilbagetrækning. Samme regel som has_active_consent() i databasen.
  async hasActive(type: ConsentType): Promise<boolean> {
    return (await this.rpc<boolean>("has_active_consent", { p_type: type })) === true;
  }

  // Al logik ligger i withdraw_consent() (security definer): sætter withdrawn_at, sletter billedrækker
  // (image_upload), lukker aktive AI-samtaler (ai_processing) og trækker åbne leads tilbage
  // (health_data_sharing). Returnerer filstierne, så controlleren kan rydde storage (architecture 5.3).
  async withdraw(consentId: string): Promise<WithdrawConsentResult> {
    const data = await this.rpc<WithdrawRow[]>(
      "withdraw_consent",
      { p_consent_id: consentId },
      {
        NOT_FOUND: notFound(),
        ALREADY_WITHDRAWN: new ApiError(409, "ALREADY_WITHDRAWN", "Samtykket er allerede trukket tilbage."),
        UNAUTHENTICATED: unauthenticated(),
      },
    );
    const row = data?.[0];
    if (!row) throw new Error("withdraw_consent: uventet svar");
    return {
      withdrawnAt: row.withdrawn_at,
      consentType: row.consent_type,
      deletedImagePaths: row.deleted_image_paths ?? [],
      closedConversations: row.closed_conversations,
      withdrawnLeads: row.withdrawn_leads,
    };
  }

  // Det aktive samtykke af en type: den seneste række, hvis den ikke er trukket tilbage (samme regel som
  // has_active_consent()). null, hvis der ikke er noget aktivt.
  async findActive(type: ConsentType): Promise<ConsentDto | null> {
    const row = await this.run(
      this.db
        .from("consents")
        .select(CONSENT_COLUMNS)
        .eq("type", type)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "consents: select fejlede",
    );
    return row && row.withdrawn_at === null ? this.toDto(row) : null;
  }

  // Som findActive, men kun hvis samtykket har den nuværende tekstversion (L2). Bruges før upload, chat og opsummering:
  // et samtykke til en ældre tekst (fx uden AI-oplysning) giver ikke ret til at bruge den nye funktion.
  async findCurrentActive(type: ConsentType): Promise<ConsentDto | null> {
    const consent = await this.findActive(type);
    return consent && consent.textVersion === CONSENT_TEXT_VERSIONS[type] ? consent : null;
  }

  // Kræver det gældende samtykke (aktivt og nuværende tekstversion) og returnerer det; ellers 403 CONSENT_REQUIRED
  // med controllerens besked. Det eneste sted serveren tjekker gældende samtykke (architecture 4.3).
  async requireCurrentActive(type: ConsentType, message: string): Promise<ConsentDto> {
    const consent = await this.findCurrentActive(type);
    if (!consent) throw consentRequired(message);
    return consent;
  }

  // Bekræfter at oprydningen efter tilbagetrækning er udført (filerne er fjernet fra storage).
  async confirmCleanup(consentId: string): Promise<void> {
    await this.rpc("confirm_consent_cleanup", { p_consent_id: consentId });
  }
}
