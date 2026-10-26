import { MessagesController } from "@/features/leads/messagesController";
import { MAX_IMAGE_UPLOAD_BYTES, MESSAGE_MAX_IMAGES } from "@/lib/common/constants/limits";
import { sendMessageSchema } from "@/lib/leads/schemas/messages";
import { imagesFormReader, jsonResponse, parseId, readJson, rejectLargeImage, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Beskedtråden pr. lead (architecture 10.12). Patienten og den verificerede klinik bag leadet er deltagere; rollen afgør
// læsevejen i controlleren (patient: tabellen med RLS, klinik: clinic_lead_messages()). Andre får 404.
export const GET = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole(["patient", "clinic"], { ctx: gate });
  const leadId = parseId((await params).id);
  return jsonResponse({ messages: await new MessagesController(gate.supabase, session).list(leadId) });
});

// JSON { body } er en tekstbesked; multipart/form-data med 1-3 `file` og valgfri `body` er en besked med billeder. Billederne
// læses først i controlleren, efter deltager-, tråd- og samtykketjek.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole(["patient", "clinic"], { ctx: gate });
  const leadId = parseId((await params).id);
  const controller = new MessagesController(gate.supabase, session);
  if ((req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    await enforceIpRateLimit("message-image-upload", req);
    const maxBytes = MESSAGE_MAX_IMAGES * MAX_IMAGE_UPLOAD_BYTES;
    rejectLargeImage(req, maxBytes);
    const readForm = imagesFormReader(req, "file", MESSAGE_MAX_IMAGES, MAX_IMAGE_UPLOAD_BYTES);
    return jsonResponse(await controller.sendWithImages(leadId, readForm), 201);
  }
  const input = await readJson(req, sendMessageSchema);
  return jsonResponse(await controller.send(leadId, input), 201);
});
