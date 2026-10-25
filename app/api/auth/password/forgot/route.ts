import { forgotPasswordSchema } from "@/lib/identity/schemas/auth";
import { jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireWebClient, siteOrigin } from "@/platform/middleware/web";
import { createSupabaseRequestClient } from "@/platform/db/supabase";
import { PasswordController } from "@/features/identity/passwordController";

// Glemt adgangskode (architecture 10.2). Undtaget fra vilkårs-gaten. Svarer altid 202, uanset om e-mailen findes.
export const POST = withApi(async (req) => {
  requireWebClient(req);
  await enforceIpRateLimit("password-forgot", req);
  const input = await readJson(req, forgotPasswordSchema);
  const { supabase } = await createSupabaseRequestClient();
  await new PasswordController(supabase).forgot(input, `${siteOrigin(req)}/nulstil-adgangskode`);
  return jsonResponse({ sent: true }, 202);
});
