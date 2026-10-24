import { NO_STORE, jsonResponse, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireAnonymous } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClaimController } from "@/features/identity/claimController";

// Den anonyme patient udsteder et engangs-token (15 min.), som bevis for sin kladde, før appen logger ind på en
// eksisterende konto (architecture 10.2). Selve det anonyme adgangstoken skal ikke sendes noget sted.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireAnonymous(gate);
  await enforceIpRateLimit("claim-token", req);
  return jsonResponse(await new ClaimController(gate.supabase, session).issueToken(), 200, NO_STORE);
});
