import { resetPasswordSchema } from "@/lib/identity/schemas/auth";
import { noContent, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireWebClient } from "@/platform/middleware/web";
import { createSupabaseRequestClient } from "@/platform/db/supabase";
import { PasswordController } from "@/features/identity/passwordController";

// Ny adgangskode med en frisk recovery-session (architecture 10.2). Undtaget fra vilkårs-gaten. Logger alle sessioner ud.
export const POST = withApi(async (req) => {
  requireWebClient(req);
  await enforceIpRateLimit("password-reset", req);
  const input = await readJson(req, resetPasswordSchema);
  const { supabase } = await createSupabaseRequestClient();
  await new PasswordController(supabase).reset(input);
  return noContent();
});
