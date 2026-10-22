import { LeadsController } from "@/features/leads/leadsController";
import { leadDecisionSchema } from "@/lib/leads/schemas/leads";
import { jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Klinikken accepterer (evt. med kommentar og præciseret pris) eller afviser (architecture 10.9). 409, hvis leadet ikke er `sent`.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const leadId = parseId((await params).id);
  const input = await readJson(req, leadDecisionSchema);
  return jsonResponse(await new LeadsController(gate.supabase, session).decide(leadId, input));
});
