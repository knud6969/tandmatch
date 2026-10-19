import { convertSchema } from "@/lib/schemas/auth";
import { NO_STORE, jsonResponse, readJson, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireAnonymous } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { isMobileClient } from "@/models/db/supabase";
import { AuthController } from "@/controllers/authController";

// Konverterer den indloggede anonyme bruger til en konto med samme user id (architecture 7.7).
// Kladde, samtaler, billeder og samtykker følger med, fordi id'et er uændret.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireAnonymous(gate);
  await enforceIpRateLimit("signup", req);
  const input = await readJson(req, convertSchema);
  const { supabase } = gate;
  const mobile = isMobileClient(req);
  const token = gate.transport === "bearer" ? gate.accessToken : null;
  return jsonResponse(
    await new AuthController(supabase, session).convertAnonymous(input, mobile, token),
    200,
    mobile ? NO_STORE : undefined,
  );
});
