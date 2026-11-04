import { ClinicStatsController } from "@/features/clinics/clinicStatsController";
import { clinicStatsQuerySchema } from "@/lib/clinics/schemas/stats";
import { jsonResponse, readQuery, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Klinikkens egne tal for en periode (clinics 10.18). Kun verificerede klinikker.
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { days } = readQuery(req, clinicStatsQuerySchema, ["days"]);
  return jsonResponse(await new ClinicStatsController(gate.supabase, session).get(days));
});
