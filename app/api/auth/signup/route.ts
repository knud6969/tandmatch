import { signupSchema } from "@/lib/schemas/auth";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { getSession } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { signup } from "@/controllers/authController";

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  await enforceIpRateLimit("signup", req);
  const input = await readJson(req, signupSchema);
  const existing = await getSession();
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await signup(supabase, gate, existing, input), 201);
});
