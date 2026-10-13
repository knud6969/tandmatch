import { createTimeBlockSchema, timeBlocksQuerySchema } from "@/lib/schemas/clinics";
import { jsonResponse, readJson, readQuery, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { ClinicsController } from "@/controllers/clinicsController";

export const GET = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const query = readQuery(req, timeBlocksQuerySchema, ["from", "to"]);
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ blocks: await new ClinicsController(supabase, session).listTimeBlocks(query) });
});

export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const input = await readJson(req, createTimeBlockSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new ClinicsController(supabase, session).createTimeBlock(input), 201);
});
