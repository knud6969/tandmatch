import { chatMessageSchema } from "@/lib/schemas/chat";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { getChatState, sendChatMessage } from "@/controllers/chatController";

type Ctx = { params: Promise<{ id: string }> };

// Chatten er kun for patienten (ejer). Tandlæger ser den aldrig (architecture 4.4, 5.5).
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getChatState(supabase, session, requestId));
});

// Én patientbesked og ét AI-svar (architecture 10.5).
export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, chatMessageSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await sendChatMessage(supabase, session, requestId, input.message), 201);
});
