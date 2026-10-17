import { ChatController } from "@/controllers/chatController";
import { CHAT_IP_LIMIT_PER_HOUR } from "@/lib/constants/limits";
import { chatMessageSchema } from "@/lib/schemas/chat";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Samtalen så langt (architecture 10.6).
export const GET = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const caseId = parseId((await params).id);
  return jsonResponse(await new ChatController(gate.supabase, session).getState(caseId));
});

// Én chat-tur: patientens besked ind, assistentens svar ud. Kræver aktivt ai_processing-samtykke.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  await enforceIpRateLimit("chat", req, CHAT_IP_LIMIT_PER_HOUR);
  const caseId = parseId((await params).id);
  const input = await readJson(req, chatMessageSchema);
  return jsonResponse(await new ChatController(gate.supabase, session).sendMessage(caseId, input), 201);
});
