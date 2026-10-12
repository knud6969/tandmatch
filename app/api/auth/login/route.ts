import { loginSchema } from "@/lib/schemas/auth";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { AuthController } from "@/controllers/authController";

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  await enforceIpRateLimit("login", req);
  const input = await readJson(req, loginSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new AuthController(supabase, null).login(gate, input));
});
