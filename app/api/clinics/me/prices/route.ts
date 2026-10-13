import { putPricesSchema } from "@/lib/schemas/clinics";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { ClinicsController } from "@/controllers/clinicsController";

export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { supabase } = gate;
  return jsonResponse({ prices: await new ClinicsController(supabase, session).listPrices() });
});

// Erstatter hele prislisten.
export const PUT = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const input = await readJson(req, putPricesSchema);
  const { supabase } = gate;
  return jsonResponse({ prices: await new ClinicsController(supabase, session).putPrices(input) });
});
