import { putServiceGroupsSchema } from "@/lib/schemas/clinics";
import { jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicsController } from "@/controllers/clinicsController";

// Klinikkens valgte kategorier (architecture 10.8).
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { supabase } = gate;
  return jsonResponse({ groupIds: await new ClinicsController(supabase, session).listServiceGroupIds() });
});

// Erstatter hele valget. Priser i fravalgte kategorier slettes i samme transaktion.
export const PUT = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const input = await readJson(req, putServiceGroupsSchema);
  const { supabase } = gate;
  return jsonResponse({ groupIds: await new ClinicsController(supabase, session).putServiceGroups(input) });
});
