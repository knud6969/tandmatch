import { termsAcceptSchema } from "@/lib/schemas/terms";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { setTermsCookie } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { acceptTerms } from "@/controllers/termsController";

// Undtaget fra vilkårs-gaten. Accepten gemmes i databasen (hvis der er en session) og i en signeret cookie.
export const POST = withApi(async (req) => {
  const input = await readJson(req, termsAcceptSchema);
  const supabase = await createSupabaseServerClient();
  const payload = await acceptTerms(supabase, input);
  await setTermsCookie(payload);
  return jsonResponse({ acceptedAt: payload.acceptedAt });
});
