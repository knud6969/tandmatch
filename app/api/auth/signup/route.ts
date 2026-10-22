import { signupSchema } from "@/lib/schemas/auth";
import { NO_STORE, jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { getSession } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { isMobileClient } from "@/platform/db/supabase";
import { AuthController } from "@/controllers/authController";

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  await enforceIpRateLimit("signup", req);
  const input = await readJson(req, signupSchema);
  const existing = await getSession(gate);
  const { supabase } = gate;
  const mobile = isMobileClient(req);
  return jsonResponse(await new AuthController(supabase, existing).signup(gate.terms, input, mobile), 201, mobile ? NO_STORE : undefined);
});
