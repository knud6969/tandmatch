import { passwordRecoverySchema } from "@/lib/identity/schemas/auth";
import { NO_STORE, jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireWebClient } from "@/platform/middleware/web";
import { createSupabaseRequestClient } from "@/platform/db/supabase";
import { PasswordController } from "@/features/identity/passwordController";

// Bytter koden fra nulstillingslinket til en recovery-session i cookies (architecture 10.2). Undtaget fra vilkårs-gaten.
export const POST = withApi(async (req) => {
  requireWebClient(req);
  await enforceIpRateLimit("password-recovery", req);
  const input = await readJson(req, passwordRecoverySchema);
  const { supabase } = await createSupabaseRequestClient();
  await new PasswordController(supabase).recover(input);
  return jsonResponse({ ok: true }, 200, NO_STORE);
});
