import { LeadsController } from "@/controllers/leadsController";
import { jsonResponse, parseId, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Ét lead i detaljer for klinikken (architecture 10.9). Åbningen sætter seen_at.
export const GET = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const leadId = parseId((await params).id);
  return jsonResponse(await new LeadsController(gate.supabase, session).getForClinic(leadId));
});
