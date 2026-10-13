import { deleteClinicSchema, patchClinicSchema } from "@/lib/schemas/clinics";
import { jsonResponse, noContent, readJson, withApi } from "@/middleware/http";
import { clearAuthCookies, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { ClinicsController } from "@/controllers/clinicsController";

export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("clinic");
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new ClinicsController(supabase, session).get());
});

export const PATCH = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const input = await readJson(req, patchClinicSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new ClinicsController(supabase, session).patch(input));
});

// Sletter kontoen; klinikken bliver `imported` (architecture 10.8). Kræver bekræftelse med "SLET".
export const DELETE = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("clinic");
  await readJson(req, deleteClinicSchema);
  const supabase = await createSupabaseServerClient();
  await new ClinicsController(supabase, session).deleteAccount();
  await clearAuthCookies();
  return noContent();
});
