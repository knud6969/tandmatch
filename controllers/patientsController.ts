import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { patchPatientSchema } from "@/lib/schemas/patients";
import type { PatientMeDto } from "@/lib/types/patients";
import type { Session } from "@/middleware/session";
import { createSupabaseAdminClient } from "@/models/db/admin";
import { PatientsRepository } from "@/models/patientsRepository";
import { AccountDeletionService } from "@/services/accountDeletionService";

type PatchPatientInput = z.infer<typeof patchPatientSchema>;

export class PatientsController {
  private readonly patients: PatientsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
  ) {
    this.patients = new PatientsRepository(supabase);
  }

  getMine(): Promise<PatientMeDto> {
    return this.patients.requireById(this.session.userId);
  }

  async patchMine(input: PatchPatientInput): Promise<PatientMeDto> {
    await this.patients.update(this.session.userId, input);
    return this.patients.requireById(this.session.userId);
  }

  // Sletter alt, også for anonyme (architecture 7.7, 9.4). Bekræftelsen ("SLET") valideres i routen.
  // Admin-klienten bruges til billedfiler og auth-brugeren (architecture 2.3 c, f).
  async deleteAccount(): Promise<void> {
    await AccountDeletionService.forAdmin(createSupabaseAdminClient()).deleteAccount(this.session.userId);
  }
}
