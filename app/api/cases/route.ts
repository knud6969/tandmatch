import { CasesController } from "@/controllers/casesController";
import { jsonResponse, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Sagsoversigten og oprettelse af en ny sag kræver konto. Den anonyme patients ene kladde oprettes af
// /api/session/anonymous (architecture 10.2, 10.5).
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  return jsonResponse({ cases: await new CasesController(gate.supabase, session).list() });
});

export const POST = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  return jsonResponse(await new CasesController(gate.supabase, session).create(), 201);
});
