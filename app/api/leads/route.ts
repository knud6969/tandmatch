import { LeadsController } from "@/controllers/leadsController";
import { clinicLeadsQuerySchema } from "@/lib/schemas/leads";
import { jsonResponse, readQuery, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

// Klinikkens leads (architecture 10.9), evt. filtreret med ?status=. Kun for verificerede klinikker.
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { status } = readQuery(req, clinicLeadsQuerySchema, ["status"]);
  return jsonResponse({ leads: await new LeadsController(gate.supabase, session).listForClinic(status) });
});
