import type { z } from "zod";
import type { patchPatientSchema } from "@/lib/schemas/patients";
import type { PatientMeDto } from "@/lib/types/patients";
import { apiRequest } from "./client";

// Patientens egen profil (navn, postnummer m.m.).
export function getPatientMe(): Promise<PatientMeDto> {
  return apiRequest<PatientMeDto>("/api/patients/me");
}

// Opdaterer kun de felter, der sendes.
export function patchPatientMe(input: z.infer<typeof patchPatientSchema>): Promise<PatientMeDto> {
  return apiRequest<PatientMeDto>("/api/patients/me", { method: "PATCH", json: input });
}
