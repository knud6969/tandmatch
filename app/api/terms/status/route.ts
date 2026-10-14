import { jsonResponse, withApi } from "@/middleware/http";
import { createAuthContext, getSession } from "@/middleware/session";
import { readCurrentTermsCookie } from "@/middleware/termsGate";
import { TermsController } from "@/controllers/termsController";

// Undtaget fra vilkårs-gaten. Sessionen hentes kun, hvis cookien ikke allerede viser en gyldig accept.
export const GET = withApi(async () => {
  const hasValidCookie = (await readCurrentTermsCookie()) !== null;
  const ctx = await createAuthContext();
  const session = hasValidCookie ? null : await getSession(ctx);
  return jsonResponse(await new TermsController(ctx.supabase, session).status(hasValidCookie));
});
