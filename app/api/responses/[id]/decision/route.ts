import { decisionSchema } from "@/lib/schemas/responses";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { decideOwnResponse } from "@/server/services/responses";

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
