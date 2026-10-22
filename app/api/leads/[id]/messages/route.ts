import { MessagesController } from "@/controllers/messagesController";
import { sendMessageSchema } from "@/lib/schemas/messages";
import { jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
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

export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole(["patient", "clinic"], { ctx: gate });
  const leadId = parseId((await params).id);
  const input = await readJson(req, sendMessageSchema);
  return jsonResponse(await new MessagesController(gate.supabase, session).send(leadId, input), 201);
});
