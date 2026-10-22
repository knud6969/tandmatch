import { anonymousSessionSchema } from "@/lib/schemas/session";
import { NO_STORE, jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { getSession } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { isMobileClient } from "@/platform/db/supabase";
import { SessionController } from "@/controllers/sessionController";

// Opretter en anonym session (Supabase anonymous sign-in) efter vilkårs-accept og AI-samtykke.
// Opretter også en tom sag (architecture 10.2). Der gives kun ai_processing her, aldrig billedsamtykke (se 9.4).
// Rate limit gælder kun, når en ny anonym bruger oprettes (ingen session endnu).
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const input = await readJson(req, anonymousSessionSchema);
  const existing = gate.userId !== null ? await getSession(gate) : null;
  if (gate.userId === null) {
    await enforceIpRateLimit("anonymous-session", req);
  }
  const { supabase } = gate;
  const mobile = isMobileClient(req);
  const result = await new SessionController(supabase, existing).createAnonymous(gate.userId, gate.terms, input, mobile);
  return jsonResponse(result.body, result.status, mobile ? NO_STORE : undefined);
});
