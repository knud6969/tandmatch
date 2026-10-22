import { CasesController } from "@/features/cases/casesController";
import { putCaseServicesSchema } from "@/lib/cases/schemas/cases";
import { jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Bekræfter sagens ydelser (1-5). Erstatter hele listen.
export const PUT = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const caseId = parseId((await params).id);
  const input = await readJson(req, putCaseServicesSchema);
  return jsonResponse(await new CasesController(gate.supabase, session).putServices(caseId, input));
});
