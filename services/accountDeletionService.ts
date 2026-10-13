import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthRepository } from "@/models/authRepository";
import { CaseImageStorage } from "@/models/caseImageStorage";
import { CleanupRepository } from "@/models/cleanupRepository";
import { AvailabilityRepository } from "@/models/availabilityRepository";
import { ClinicDentistsRepository } from "@/models/clinicDentistsRepository";
import { ClinicsRepository } from "@/models/clinicsRepository";
import { PublicMediaStorage } from "@/models/publicMediaStorage";

// Sletter alt for én bruger: billedmapperne pr. sag og auth-brugeren. Rækker slettes via cascade
// (architecture 7.7, 9.4). Billedstien er {case_id}/{image_id}.jpg (ikke {patient_id}/...), så mapperne
// slettes pr. sag, ikke pr. patient. Bruges af patientens egen sletning, samtykketilbagetrækning
// og oprydningsjobbet. Får service role-klienten i constructoren (architecture 2.3 c, f).
export class AccountDeletionService {
  private readonly cleanup: CleanupRepository;
  private readonly images: CaseImageStorage;
  private readonly auth: AuthRepository;
  private readonly clinics: ClinicsRepository;
  private readonly dentists: ClinicDentistsRepository;
  private readonly availability: AvailabilityRepository;
  private readonly media: PublicMediaStorage;

  constructor(admin: SupabaseClient) {
    this.cleanup = new CleanupRepository(admin);
    this.images = new CaseImageStorage(admin);
    this.auth = new AuthRepository(admin);
    this.clinics = new ClinicsRepository(admin);
    this.dentists = new ClinicDentistsRepository(admin);
    this.availability = new AvailabilityRepository(admin);
    this.media = new PublicMediaStorage(admin);
  }

  async deleteAccount(userId: string): Promise<void> {
    for (const caseId of await this.cleanup.listCaseIdsForPatient(userId)) {
      await this.images.removeCase(caseId);
    }
    await this.auth.deleteUser(userId);
  }

  // Sletter en klinikkonto (architecture 10.8): filerne i public-media (logo, tandlæger, portefølje), rækkerne for tandlæger
  // og portefølje, logo-stien, prisliste, blokerede tider, beskrivelsen og klinikindtastet Trustpilot (admin-indtastet bevares), og auth-brugeren.
  // Offentlige grunddata (navn, adresse, postnummer, by, telefon, åbningstider) bevares. Klinikrækken bliver tilbage som `imported`, og triggeren clinics_after_owner_removed() afviser
  // leads og aflyser fremtidige bookinger (5.3). Filerne ryddes først, mens ejeren stadig kan slås op; fejler
  // sletningen af brugeren bagefter, kan kontoen slettes igen.
  async deleteClinicAccount(userId: string): Promise<void> {
    const clinicId = await this.clinics.findIdByOwner(userId);
    if (clinicId) {
      await this.media.removeClinic(clinicId);
      await this.dentists.deleteAllForClinic(clinicId); // portefølje følger med via cascade
      await this.clinics.setLogoPath(clinicId, null);
      await this.clinics.deleteAllPrices(clinicId);
      await this.availability.deleteAllTimeBlocks(clinicId);
      await this.clinics.clearClinicEnteredData(clinicId);
    }
    await this.auth.deleteUser(userId);
  }
}
