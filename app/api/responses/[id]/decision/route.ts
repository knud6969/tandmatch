import { decisionSchema } from "@/lib/schemas/responses";
import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { decideOwnResponse } from "@/controllers/responsesController";

type Ctx = { params: Promise<{ id: string }> };

// Patienten (ejer) vælger eller afviser et svar. Permanent patient (anonyme kan ikke have sendte forespørgsler).
export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  await requireRole("patient");
  const responseId = parseId((await ctx.params).id);
  const input = await readJson(req, decisionSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await decideOwnResponse(supabase, responseId, input.decision));
});
