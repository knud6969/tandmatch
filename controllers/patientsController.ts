import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { patchPatientSchema } from "@/lib/schemas/patients";
import type { PatientMeDto } from "@/lib/types/patients";
import { ApiError } from "@/middleware/http";
import { getPatient, updatePatient } from "@/models/patientsModel";
import { deleteAccountData } from "@/services/accountDeletion";

type PatchPatientInput = z.infer<typeof patchPatientSchema>;

function toDto(patient: { firstName: string | null; postalCode: string | null }): PatientMeDto {
  return { firstName: patient.firstName, postalCode: patient.postalCode };
}

export async function getMyPatient(supabase: SupabaseClient, userId: string): Promise<PatientMeDto> {
  const patient = await getPatient(supabase, userId);
  if (!patient) {
    throw new ApiError(404, "NOT_FOUND", "Fandt ikke det ønskede.");
  }
  return toDto(patient);
}

export async function patchMyPatient(
  supabase: SupabaseClient,
  userId: string,
  input: PatchPatientInput,
): Promise<PatientMeDto> {
  await updatePatient(supabase, userId, {
    ...(input.firstName !== undefined ? { first_name: input.firstName } : {}),
    ...(input.postalCode !== undefined ? { postal_code: input.postalCode } : {}),
  });
  const patient = await getPatient(supabase, userId);
  if (!patient) {
    throw new ApiError(404, "NOT_FOUND", "Fandt ikke det ønskede.");
  }
  return toDto(patient);
}

// Sletter alt, også for anonyme (architecture 7.7, 9.4). Bekræftelsen ("SLET") valideres i routen.
export async function deleteMyPatientAccount(userId: string): Promise<void> {
  await deleteAccountData(userId);
}
