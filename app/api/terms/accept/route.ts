import { termsAcceptSchema } from "@/lib/schemas/terms";
import { NO_STORE, jsonResponse, readJson, withApi } from "@/middleware/http";
import { signTermsPayload } from "@/middleware/termsCookie";
import { setTermsCookie } from "@/middleware/termsGate";
import { createSupabaseRequestClient, isMobileClient } from "@/models/db/supabase";
import { TermsController } from "@/controllers/termsController";

// Undtaget fra vilkårs-gaten. Accepten gemmes i databasen (hvis der er en session) og i en signeret cookie.
// Fra appen (X-TandMatch-Client: mobile) sættes ingen cookie; den samme signerede accept returneres som termsToken.
export const POST = withApi(async (req) => {
  const input = await readJson(req, termsAcceptSchema);
  const { supabase, accessToken } = await createSupabaseRequestClient();
  const payload = await new TermsController(supabase, null).accept(input, accessToken ?? undefined);
  if (isMobileClient(req)) {
    return jsonResponse({ acceptedAt: payload.acceptedAt, termsToken: await signTermsPayload(payload) }, 200, NO_STORE);
  }
  await setTermsCookie(payload);
  return jsonResponse({ acceptedAt: payload.acceptedAt });
});
