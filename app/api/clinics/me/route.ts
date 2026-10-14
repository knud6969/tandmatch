import { deleteClinicSchema, patchClinicSchema } from "@/lib/schemas/clinics";
import { jsonResponse, noContent, readJson, withApi } from "@/middleware/http";
import { clearAuthCookies, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { ClinicsController } from "@/controllers/clinicsController";

export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { supabase } = gate;
  return jsonResponse(await new ClinicsController(supabase, session).get());
});

export const PATCH = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const input = await readJson(req, patchClinicSchema);
  const { supabase } = gate;
  return jsonResponse(await new ClinicsController(supabase, session).patch(input));
});

// Sletter kontoen (architecture 10.8): en selvoprettet klinik bliver `removed`, en overtaget importeret klinik bliver
// `imported` med grunddata gendannet fra snapshot. Kræver bekræftelse med "SLET".
export const DELETE = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  await readJson(req, deleteClinicSchema);
  const { supabase } = gate;
  await new ClinicsController(supabase, session).deleteAccount();
  await clearAuthCookies();
  return noContent();
});
