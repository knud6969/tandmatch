import { patchPatientSchema, deleteAccountSchema } from "@/lib/schemas/patients";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { clearAuthCookies, createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, readJson, withApi } from "@/server/http/api";
import { getPatient, updatePatient } from "@/server/models/patients";
import { deleteAccountData } from "@/server/services/accounts";

function toDto(patient: { firstName: string | null; postalCode: string | null }) {
  return { firstName: patient.firstName, postalCode: patient.postalCode };
}

export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  const patient = await getPatient(supabase, session.userId);
  if (!patient) {
    throw new ApiError(404, "NOT_FOUND", "Fandt ikke det ønskede.");
  }
  return jsonResponse(toDto(patient));
});

export const PATCH = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient");
  const input = await readJson(req, patchPatientSchema);
  const supabase = await createSupabaseServerClient();
  await updatePatient(supabase, session.userId, {
    ...(input.firstName !== undefined ? { first_name: input.firstName } : {}),
    ...(input.postalCode !== undefined ? { postal_code: input.postalCode } : {}),
  });
  const patient = await getPatient(supabase, session.userId);
  if (!patient) {
    throw new ApiError(404, "NOT_FOUND", "Fandt ikke det ønskede.");
  }
  return jsonResponse(toDto(patient));
});

// Sletter alt, også for anonyme (architecture 7.7, 9.4). Kræver bekræftelse med "SLET".
export const DELETE = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  await readJson(req, deleteAccountSchema);
  await deleteAccountData(session.userId);
  await clearAuthCookies();
  return new Response(null, { status: 204 });
});
