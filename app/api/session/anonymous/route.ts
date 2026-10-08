import { anonymousSessionSchema } from "@/lib/schemas/session";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { getSession } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { createAnonymousSession } from "@/controllers/sessionController";

// Opretter en anonym session (Supabase anonymous sign-in) efter vilkårs-accept og AI-samtykke.
// Kladden oprettes med den valgte kategori. Der gives kun ai_processing her, aldrig billedsamtykke (se 9.4).
// Rate limit gælder kun, når en ny anonym bruger oprettes (ingen session endnu).
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const input = await readJson(req, anonymousSessionSchema);
  const existing = gate.userId !== null ? await getSession() : null;
  if (gate.userId === null) {
    await enforceIpRateLimit("anonymous-session", req);
  }
  const supabase = await createSupabaseServerClient();
  const result = await createAnonymousSession(supabase, gate, existing, input);
  return jsonResponse(result.body, result.status);
});
