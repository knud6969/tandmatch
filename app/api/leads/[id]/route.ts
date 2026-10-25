import { LeadsController } from "@/features/leads/leadsController";
import { NO_STORE, jsonResponse, parseId, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Ét lead i detaljer for klinikken (architecture 10.9). Åbningen sætter seen_at. Helbredsdata og signerede billed-URL'er: no-store.
export const GET = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const leadId = parseId((await params).id);
  return jsonResponse(await new LeadsController(gate.supabase, session).getForClinic(leadId), 200, NO_STORE);
});
