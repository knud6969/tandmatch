import { deleteAccountSchema } from "@/lib/schemas/auth";
import { patchPatientSchema } from "@/lib/schemas/patients";
import { jsonResponse, noContent, readJson, withApi } from "@/middleware/http";
import { clearAuthCookies, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { PatientsController } from "@/controllers/patientsController";

export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  const { supabase } = gate;
  return jsonResponse(await new PatientsController(supabase, session).getMine());
});

export const PATCH = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  const input = await readJson(req, patchPatientSchema);
  const { supabase } = gate;
  return jsonResponse(await new PatientsController(supabase, session).patchMine(input));
});

// Sletter alt, også for anonyme (architecture 7.7, 9.4). Kræver bekræftelse med "SLET".
export const DELETE = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  await readJson(req, deleteAccountSchema);
  const { supabase } = gate;
  await new PatientsController(supabase, session).deleteAccount();
  await clearAuthCookies();
  return noContent();
});
