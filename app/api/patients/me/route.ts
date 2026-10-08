import { deleteAccountSchema, patchPatientSchema } from "@/lib/schemas/patients";
import { jsonResponse, noContent, readJson, withApi } from "@/middleware/http";
import { clearAuthCookies, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { deleteMyPatientAccount, getMyPatient, patchMyPatient } from "@/controllers/patientsController";

export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getMyPatient(supabase, session.userId));
});

export const PATCH = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient");
  const input = await readJson(req, patchPatientSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await patchMyPatient(supabase, session.userId, input));
});

// Sletter alt, også for anonyme (architecture 7.7, 9.4). Kræver bekræftelse med "SLET".
export const DELETE = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  await readJson(req, deleteAccountSchema);
  await deleteMyPatientAccount(session.userId);
  await clearAuthCookies();
  return noContent();
});
