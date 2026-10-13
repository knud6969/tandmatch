import { putOpeningHoursSchema } from "@/lib/schemas/clinics";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { ClinicsController } from "@/controllers/clinicsController";

export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { supabase } = gate;
  return jsonResponse({ hours: await new ClinicsController(supabase, session).listOpeningHours() });
});

// Erstatter alle åbningstider.
export const PUT = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const input = await readJson(req, putOpeningHoursSchema);
  const { supabase } = gate;
  return jsonResponse({ hours: await new ClinicsController(supabase, session).putOpeningHours(input) });
});
