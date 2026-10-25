import { LeadsController } from "@/features/leads/leadsController";
import { clinicLeadsQuerySchema } from "@/lib/leads/schemas/leads";
import { NO_STORE, jsonResponse, readQuery, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Klinikkens leads (architecture 10.9), evt. filtreret med ?status=. Kun for verificerede klinikker. Helbredsdata: no-store.
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { status } = readQuery(req, clinicLeadsQuerySchema, ["status"]);
  return jsonResponse({ leads: await new LeadsController(gate.supabase, session).listForClinic(status) }, 200, NO_STORE);
});
