import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthRepository } from "@/models/authRepository";
import { CaseImageStorage } from "@/models/caseImageStorage";
import { CleanupRepository } from "@/models/cleanupRepository";

// Sletter alt for én bruger: billedmapperne pr. sag og auth-brugeren. Rækker slettes via cascade
// (architecture 7.7, 9.4). Billedstien er {case_id}/{image_id}.jpg (ikke {patient_id}/...), så mapperne
// slettes pr. sag, ikke pr. patient. Bruges af patientens egen sletning, samtykketilbagetrækning
// og oprydningsjobbet. Alle afhængigheder bruger admin-klienten (architecture 2.3 c, f).
export class AccountDeletionService {
  constructor(
    private readonly cleanup: CleanupRepository,
    private readonly images: CaseImageStorage,
    private readonly auth: AuthRepository,
  ) {}

  // Bygger servicen ud fra admin-klienten, så controllerne ikke gentager sammensætningen.
  static forAdmin(admin: SupabaseClient): AccountDeletionService {
    return new AccountDeletionService(new CleanupRepository(admin), new CaseImageStorage(admin), new AuthRepository(admin));
  }

  async deleteAccount(userId: string): Promise<void> {
    for (const caseId of await this.cleanup.listCaseIdsForPatient(userId)) {
      await this.images.removeCase(caseId);
    }
    // Rydder også en eventuel ældre mappe {uid}/ fra før sti-ændringen (ingen effekt hvis den ikke findes).
    await this.images.removePrefix(userId);
    await this.auth.deleteUser(userId);
  }
}
