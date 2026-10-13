import { putPricesSchema } from "@/lib/schemas/clinics";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { ClinicsController } from "@/controllers/clinicsController";

export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("clinic");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ prices: await new ClinicsController(supabase, session).listPrices() });
});

// Erstatter hele prislisten.
export const PUT = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const input = await readJson(req, putPricesSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ prices: await new ClinicsController(supabase, session).putPrices(input) });
});
