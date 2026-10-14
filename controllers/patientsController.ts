import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { patchPatientSchema } from "@/lib/schemas/patients";
import type { PatientMeDto } from "@/lib/types/patients";
import type { Session } from "@/middleware/session";
import { lazyAdminClient } from "@/models/db/admin";
import { PatientsRepository } from "@/models/patientsRepository";
import { AccountDeletionService } from "@/services/accountDeletionService";

type PatchPatientInput = z.infer<typeof patchPatientSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type PatientsDeps = { patients: PatientsRepository; admin: () => SupabaseClient };

export class PatientsController {
  private readonly patients: PatientsRepository;
  // Service role-klienten (architecture 2.3, 2.1.1). Gives kun videre til kontosletningen.
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<PatientsDeps> = {},
  ) {
    this.patients = deps.patients ?? new PatientsRepository(supabase);
    this.admin = deps.admin ?? lazyAdminClient();
  }

  getMine(): Promise<PatientMeDto> {
    return this.patients.requireById(this.session.userId);
  }

  async patchMine(input: PatchPatientInput): Promise<PatientMeDto> {
    return this.patients.update(this.session.userId, input);
  }

  // Sletter alt, også for anonyme (architecture 7.7, 9.4). Bekræftelsen ("SLET") valideres i routen.
  async deleteAccount(): Promise<void> {
    // 2.3 (c, f): billedfiler og auth-brugeren.
    await new AccountDeletionService(this.admin()).deleteAccount(this.session.userId);
  }
}
