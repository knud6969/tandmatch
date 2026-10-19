import { loginSchema } from "@/lib/schemas/auth";
import { NO_STORE, jsonResponse, readJson, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireTerms } from "@/middleware/termsGate";
import { isMobileClient } from "@/models/db/supabase";
import { AuthController } from "@/controllers/authController";

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  await enforceIpRateLimit("login", req);
  const input = await readJson(req, loginSchema);
  const { supabase } = gate;
  const mobile = isMobileClient(req);
  return jsonResponse(await new AuthController(supabase, null).login(gate.terms, input, mobile), 200, mobile ? NO_STORE : undefined);
});
