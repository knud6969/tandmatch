import { convertSchema } from "@/lib/schemas/auth";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { requireAnonymous } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { AuthController } from "@/controllers/authController";

// Konverterer den indloggede anonyme bruger til en konto med samme user id (architecture 7.7).
// Kladde, samtaler, billeder og samtykker følger med, fordi id'et er uændret.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireAnonymous(gate);
  const input = await readJson(req, convertSchema);
  const { supabase } = gate;
  return jsonResponse(await new AuthController(supabase, session).convertAnonymous(input));
});
