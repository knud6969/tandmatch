import { ChatController } from "@/features/cases/chatController";
import { CHAT_IP_LIMIT_PER_HOUR } from "@/lib/common/constants/limits";
import { generateSummarySchema } from "@/lib/cases/schemas/chat";
import { jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Billedtur (architecture 7.9c): AI'en reagerer på nyuploadede billeder uden patientbesked. Kræver aktivt ai_processing- og
// image_upload-samtykke. Samme IP-grænse som chatten.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  await enforceIpRateLimit("chat", req, CHAT_IP_LIMIT_PER_HOUR);
  const caseId = parseId((await params).id);
  await readJson(req, generateSummarySchema); // tom body: {}
  return jsonResponse(await new ChatController(gate.supabase, session).sendImageTurn(caseId), 201);
});
