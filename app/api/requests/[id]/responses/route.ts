import { createResponseSchema } from "@/lib/schemas/responses";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { requireParticipant, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { createResponse, listResponsesForSession } from "@/controllers/responsesController";

type Ctx = { params: Promise<{ id: string }> };

// Patient (ejer) ser alle svar. Tandlæge (modtager) ser kun sit eget svar. Andre roller afvises.
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireParticipant();
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ responses: await listResponsesForSession(supabase, session, requestId) });
});

// Tandlægen svarer én gang pr. forespørgsel. Kun verificerede modtagere, mens forespørgslen er sendt og åben.
export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, createResponseSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await createResponse(supabase, session.userId, requestId, input), 201);
});
