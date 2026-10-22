import { jsonResponse, withApi } from "@/platform/middleware/http";
import { createAuthContext, getSession } from "@/platform/middleware/session";
import { readCurrentTerms } from "@/platform/middleware/termsGate";
import { TermsController } from "@/features/identity/termsController";

// Undtaget fra vilkårs-gaten. Sessionen hentes kun, hvis cookien ikke allerede viser en gyldig accept.
export const GET = withApi(async () => {
  const hasValidCookie = (await readCurrentTerms()) !== null;
  const ctx = await createAuthContext();
  const session = hasValidCookie ? null : await getSession(ctx);
  return jsonResponse(await new TermsController(ctx.supabase, session).status(hasValidCookie));
});
