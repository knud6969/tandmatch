import { deleteAccountSchema, patchPatientSchema } from "@/lib/schemas/patients";
import { jsonResponse, noContent, readJson, withApi } from "@/middleware/http";
import { clearAuthCookies, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { PatientsController } from "@/controllers/patientsController";

export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new PatientsController(supabase, session).getMine());
});

export const PATCH = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient");
  const input = await readJson(req, patchPatientSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new PatientsController(supabase, session).patchMine(input));
});

// Sletter alt, også for anonyme (architecture 7.7, 9.4). Kræver bekræftelse med "SLET".
export const DELETE = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  await readJson(req, deleteAccountSchema);
  const supabase = await createSupabaseServerClient();
  await new PatientsController(supabase, session).deleteAccount();
  await clearAuthCookies();
  return noContent();
});
