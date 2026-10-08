import { patchResponseSchema } from "@/lib/schemas/responses";
import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { updateOwnResponse } from "@/controllers/responsesController";

type Ctx = { params: Promise<{ id: string }> };

// Tandlægen (forfatter) ændrer eget svar, eller trækker det tilbage. Låses når patienten har valgt.
export const PATCH = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const responseId = parseId((await ctx.params).id);
  const input = await readJson(req, patchResponseSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await updateOwnResponse(supabase, session.userId, responseId, input));
});
