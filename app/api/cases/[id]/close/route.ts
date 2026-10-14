import { CasesController } from "@/controllers/casesController";
import { jsonResponse, parseId, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Lukker sagen med close_case() (idempotent, architecture 10.5).
export const POST = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const caseId = parseId((await params).id);
  return jsonResponse(await new CasesController(gate.supabase, session).close(caseId));
});
