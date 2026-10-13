import { createTimeBlockSchema, timeBlocksQuerySchema } from "@/lib/schemas/clinics";
import { jsonResponse, readJson, readQuery, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { ClinicsController } from "@/controllers/clinicsController";

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
