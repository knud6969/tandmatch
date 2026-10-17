import { SummaryController } from "@/controllers/summaryController";
import { SUMMARY_IP_LIMIT_PER_HOUR } from "@/lib/constants/limits";
import { approveSummarySchema, generateSummarySchema } from "@/lib/schemas/chat";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Laver et udkast til opsummeringen (architecture 10.5). Kræver aktivt ai_processing-samtykke.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  await enforceIpRateLimit("summary", req, SUMMARY_IP_LIMIT_PER_HOUR);
  const caseId = parseId((await params).id);
  await readJson(req, generateSummarySchema);
  return jsonResponse(await new SummaryController(gate.supabase, session).generate(caseId));
});

// Patientens rettede og godkendte opsummering (approve_summary).
export const PUT = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const caseId = parseId((await params).id);
  const input = await readJson(req, approveSummarySchema);
  return jsonResponse(await new SummaryController(gate.supabase, session).approve(caseId, input));
});
