import { createResponseSchema } from "@/lib/schemas/responses";
import { requireTerms } from "@/server/auth/terms";
import { requireRole, requireSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { createResponse, listResponsesForSession } from "@/server/services/responses";

type Ctx = { params: Promise<{ id: string }> };

// Patient (ejer) ser alle svar. Tandlæge (modtager) ser kun sit eget svar. Andre roller afvises.
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireSession();
  const role = session.role === "dentist" ? "dentist" : "patient";
  await requireRole(role);
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  const responses = await listResponsesForSession(supabase, { userId: session.userId, role }, requestId);
  return jsonResponse({ responses });
});

// Tandlægen svarer én gang pr. forespørgsel. Kun verificerede modtagere, mens forespørgslen er sendt og åben.
export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, createResponseSchema);
  const supabase = await createSupabaseServerClient();
  const response = await createResponse(supabase, session.userId, requestId, input);
  return jsonResponse(response, 201);
});
