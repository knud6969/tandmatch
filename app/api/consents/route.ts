import { grantConsentSchema } from "@/lib/schemas/consents";
import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { grantOwnConsent, listOwnConsents } from "@/controllers/consentsController";

// Samtykker (GDPR art. 9). Vilkårs-accept er IKKE et samtykke (architecture 2.5, 10.3).
export const GET = withApi(async () => {
  await requireTerms();
  await requireRole("patient", { allowAnonymous: true });
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ consents: await listOwnConsents(supabase) });
});

export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const input = await readJson(req, grantConsentSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await grantOwnConsent(supabase, session, input), 201);
});
