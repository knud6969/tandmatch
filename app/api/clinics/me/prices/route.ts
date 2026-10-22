import { putPricesSchema } from "@/lib/clinics/schemas/clinics";
import { jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicsController } from "@/features/clinics/clinicsController";

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
