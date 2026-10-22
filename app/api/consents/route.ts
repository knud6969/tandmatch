import { grantConsentSchema } from "@/lib/identity/schemas/consents";
import { requireTerms } from "@/platform/middleware/termsGate";
import { requireRole } from "@/platform/middleware/session";
import { jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { ConsentsController } from "@/features/identity/consentsController";

// Samtykker (GDPR art. 9). Vilkårs-accept er IKKE et samtykke (architecture 2.5, 10.3).
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const { supabase } = gate;
  return jsonResponse({ consents: await new ConsentsController(supabase, session).listOwn() });
});

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const input = await readJson(req, grantConsentSchema);
  const { supabase } = gate;
  return jsonResponse(await new ConsentsController(supabase, session).grant(input), 201);
});
