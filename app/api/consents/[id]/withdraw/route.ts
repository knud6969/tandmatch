import { requireTerms } from "@/platform/middleware/termsGate";
import { clearAuthCookies, requireRole } from "@/platform/middleware/session";
import { jsonResponse, parseId, withApi } from "@/platform/middleware/http";
import { ConsentsController } from "@/controllers/consentsController";

type Ctx = { params: Promise<{ id: string }> };

// Tilbagetrækning af samtykke, også anonymt (architecture 7.7, 10.3). Kun ejeren (tjekket i withdraw_consent()).
export const POST = withApi(async (_req, ctx: Ctx) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const consentId = parseId((await ctx.params).id);
  const { supabase } = gate;
  const result = await new ConsentsController(supabase, session).withdraw(consentId);
  if (result.sessionDeleted) {
    await clearAuthCookies();
  }
  return jsonResponse(result);
});
