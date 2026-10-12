import { jsonResponse, withApi } from "@/middleware/http";
import { getSession } from "@/middleware/session";
import { readCurrentTermsCookie } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { TermsController } from "@/controllers/termsController";

// Undtaget fra vilkårs-gaten. Sessionen hentes kun, hvis cookien ikke allerede viser en gyldig accept.
export const GET = withApi(async () => {
  const hasValidCookie = (await readCurrentTermsCookie()) !== null;
  const session = hasValidCookie ? null : await getSession();
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new TermsController(supabase, session).status(hasValidCookie));
});
