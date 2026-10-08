import { createMessageSchema } from "@/lib/schemas/messages";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { requireParticipant } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { getThread, sendMessage } from "@/controllers/messagesController";

type Ctx = { params: Promise<{ id: string }> };

// Beskedtråden hænger på ét svar: altid præcis én patient og én tandlæge (architecture 4.3, 10.7).
// RLS (is_response_participant) håndhæver det samme, uanset hvad API'et gør.
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireParticipant();
  const responseId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ messages: await getThread(supabase, session.userId, responseId) });
});

export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireParticipant();
  const responseId = parseId((await ctx.params).id);
  const input = await readJson(req, createMessageSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await sendMessage(supabase, session.userId, responseId, input.body), 201);
});
