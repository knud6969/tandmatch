import { loginSchema } from "@/lib/identity/schemas/auth";
import { NO_STORE, jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireTerms } from "@/platform/middleware/termsGate";
import { isMobileClient } from "@/platform/db/supabase";
import { AuthController } from "@/features/identity/authController";

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  await enforceIpRateLimit("login", req);
  const input = await readJson(req, loginSchema);
  const { supabase } = gate;
  const mobile = isMobileClient(req);
  return jsonResponse(await new AuthController(supabase, null).login(gate.terms, input, mobile), 200, mobile ? NO_STORE : undefined);
});
