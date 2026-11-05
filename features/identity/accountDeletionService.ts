import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthRepository } from "@/features/identity/authRepository";
import { CleanupRepository } from "@/platform/cleanupRepository";
import { PublicMediaStorage } from "@/features/clinics";
import { MessageImageStorage } from "@/features/leads";
import { StorageCleanupService } from "@/platform/storageCleanupService";

// Sletter alt for én bruger: auth-brugeren (rækker slettes via cascade) og derefter billedmapperne pr. sag og beskedbillederne pr. lead
// (messages/{lead_id}/). Klinikker: filer i public-media og auth-brugeren. Billedstien er {case_id}/{image_id}.jpg (ikke
// {patient_id}/...), så mapperne slettes pr. sag, ikke pr. patient. Bruges af patientens egen sletning, samtykketilbagetrækning og
// oprydningsjobbet. Får service role-klienten i constructoren (architecture 2.3 c, f).
//
// Rækkefølgen for patienter (security M4): sag- og lead-id'erne læses først, derefter slettes auth-brugeren. Cascade sletter
// case_images og message_images, og triggere lægger stierne i pending_storage_paths i samme transaktion, så ingen fil kan blive
// forældreløs, selv om filsletningen fejler eller processen stopper. Mapperne slettes bagefter (også filer uden række), og kan
// det ikke lade sig gøre, lægges de i køen til cronjobbet /api/cron/cleanup-storage. Fejler sletningen af brugeren, er intet rørt,
// og den kan gentages.
export class AccountDeletionService {
  private readonly cleanup: CleanupRepository;
  private readonly files: StorageCleanupService;
  private readonly auth: AuthRepository;
  private readonly media: PublicMediaStorage;

  constructor(admin: SupabaseClient) {
    this.cleanup = new CleanupRepository(admin);
    this.files = new StorageCleanupService(admin);
    this.auth = new AuthRepository(admin);
    this.media = new PublicMediaStorage(admin);
  }

  async deleteAccount(userId: string): Promise<void> {
    const caseIds = await this.cleanup.listCaseIdsForPatient(userId);
    const leadIds = await this.cleanup.listLeadIdsForCases(caseIds);
    await this.auth.deleteUser(userId);
    for (const caseId of caseIds) await this.files.discardPrefix("case-images", caseId);
    // Billeder i beskedtrådene (både patientens og klinikkens); rækkerne gik med leadet via cascade.
    for (const leadId of leadIds) await this.files.discardPrefix("case-images", MessageImageStorage.leadPrefix(leadId));
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
