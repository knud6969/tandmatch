import { CasesController } from "@/controllers/casesController";
import { patchCaseSchema } from "@/lib/schemas/cases";
import { jsonResponse, noContent, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Patientens egen sag; anonyme må rette og slette deres egen kladde (architecture 10.5).
export const GET = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const caseId = parseId((await params).id);
  return jsonResponse(await new CasesController(gate.supabase, session).get(caseId));
});

export const PATCH = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const caseId = parseId((await params).id);
  const input = await readJson(req, patchCaseSchema);
  return jsonResponse(await new CasesController(gate.supabase, session).patch(caseId, input));
});

export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const caseId = parseId((await params).id);
  await new CasesController(gate.supabase, session).delete(caseId);
  return noContent();
});
