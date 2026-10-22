import { createTimeBlockSchema, timeBlocksQuerySchema } from "@/lib/clinics/schemas/clinics";
import { jsonResponse, readJson, readQuery, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicsController } from "@/features/clinics/clinicsController";

export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const query = readQuery(req, timeBlocksQuerySchema, ["from", "to"]);
  const { supabase } = gate;
  return jsonResponse({ blocks: await new ClinicsController(supabase, session).listTimeBlocks(query) });
});

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const input = await readJson(req, createTimeBlockSchema);
  const { supabase } = gate;
  return jsonResponse(await new ClinicsController(supabase, session).createTimeBlock(input), 201);
});
