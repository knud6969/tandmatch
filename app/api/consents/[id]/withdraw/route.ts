import { requireTerms } from "@/middleware/termsGate";
import { clearAuthCookies, requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, parseId, withApi } from "@/middleware/http";
import { withdrawOwnConsent } from "@/controllers/consentsController";

type Ctx = { params: Promise<{ id: string }> };

// Tilbagetrækning af samtykke, også anonymt (architecture 7.7, 10.3). Kun ejeren (tjekket i withdraw_consent()).
export const POST = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const consentId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  const result = await withdrawOwnConsent(supabase, session, consentId);
  if (result.sessionDeleted) {
    await clearAuthCookies();
  }
  return jsonResponse(result);
});
