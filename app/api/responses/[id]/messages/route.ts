import { createMessageSchema } from "@/lib/schemas/messages";
import { requireTerms } from "@/server/auth/terms";
import { requireRole, requireSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { getThread, sendMessage } from "@/server/services/messages";

type Ctx = { params: Promise<{ id: string }> };

// Beskedtråden hænger på ét svar: altid præcis én patient og én tandlæge (architecture 4.3, 10.7).
// RLS (is_response_participant) håndhæver det samme, uanset hvad API'et gør.
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireSession();
  const role = session.role === "dentist" ? "dentist" : "patient";
  await requireRole(role);
  const responseId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ messages: await getThread(supabase, session.userId, responseId) });
});

export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireSession();
  const role = session.role === "dentist" ? "dentist" : "patient";
  await requireRole(role);
  const responseId = parseId((await ctx.params).id);
  const input = await readJson(req, createMessageSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await sendMessage(supabase, session.userId, responseId, input.body), 201);
});
