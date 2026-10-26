import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthRepository } from "@/features/identity/authRepository";
import { CaseImageStorage } from "@/features/cases";
import { CleanupRepository } from "@/platform/cleanupRepository";
import { PublicMediaStorage } from "@/features/clinics";
import { MessageImageStorage } from "@/features/leads";

// Sletter alt for én bruger: billedmapperne pr. sag, beskedbillederne pr. lead (messages/{lead_id}/) og auth-brugeren (klinikker: filer i public-media og auth-brugeren). Rækker slettes via cascade
// (architecture 7.7, 9.4). Billedstien er {case_id}/{image_id}.jpg (ikke {patient_id}/...), så mapperne
// slettes pr. sag, ikke pr. patient. Bruges af patientens egen sletning, samtykketilbagetrækning
// og oprydningsjobbet. Får service role-klienten i constructoren (architecture 2.3 c, f).
export class AccountDeletionService {
  private readonly cleanup: CleanupRepository;
  private readonly images: CaseImageStorage;
  private readonly auth: AuthRepository;
  private readonly media: PublicMediaStorage;
  private readonly messageImages: MessageImageStorage;

  constructor(admin: SupabaseClient) {
    this.cleanup = new CleanupRepository(admin);
    this.images = new CaseImageStorage(admin);
    this.auth = new AuthRepository(admin);
    this.media = new PublicMediaStorage(admin);
    this.messageImages = new MessageImageStorage(admin);
  }

  async deleteAccount(userId: string): Promise<void> {
    const caseIds = await this.cleanup.listCaseIdsForPatient(userId);
    for (const caseId of caseIds) {
      await this.images.removeCase(caseId);
    }
    // Billeder i beskedtrådene (både patientens og klinikkens); rækkerne går med leadet via cascade.
    for (const leadId of await this.cleanup.listLeadIdsForCases(caseIds)) {
      await this.messageImages.removeLead(leadId);
    }
    await this.auth.deleteUser(userId);
  }

  // Sletter en klinikkonto (architecture 10.8): filerne i public-media (logo, tandlægeportrætter, portefølje) og auth-brugeren.
  // Rækkerne ryddes af triggeren clinics_after_owner_removed(), når auth-brugeren er væk (5.3): prisliste, valgte
  // kategorier, blokeringer, tandlæger, portefølje, beskrivelse, logo, e-mail, website og klinikindtastet Trustpilot, og
  // åbne leads afvises og fremtidige bookinger aflyses. Klinik-id'et hentes af controlleren med brugerens egen klient
  // (ejertjek), så service role ikke bruges til at slå klinikken op. Filerne ryddes først; fejler sletningen af brugeren
  // bagefter, kan kontoen slettes igen.
  async deleteClinicAccount(clinicId: string, userId: string): Promise<void> {
    await this.media.removeClinic(clinicId);
    await this.auth.deleteUser(userId);
  }
}
