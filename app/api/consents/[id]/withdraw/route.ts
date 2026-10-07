import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, withApi } from "@/server/http/api";
import { withdrawOwnConsent } from "@/server/services/consents";

type Ctx = { params: Promise<{ id: string }> };

// Tilbagetrækning af samtykke, også anonymt (architecture 7.7, 10.3). Kun ejeren (tjekket i withdraw_consent()).
export const POST = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const consentId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await withdrawOwnConsent(supabase, session, consentId));
});
