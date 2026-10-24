import { claimSchema } from "@/lib/identity/schemas/session";
import { NO_STORE, jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClaimController } from "@/features/identity/claimController";

// Den indloggede patient (permanent konto) overtager den anonyme kladde med engangs-tokenet fra /api/session/claim-token
// (architecture 10.2). Klinikker og anonyme afvises; databasefunktionen tjekker det igen.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  await enforceIpRateLimit("claim", req);
  const input = await readJson(req, claimSchema);
  return jsonResponse(await new ClaimController(gate.supabase, session).claim(input.claimToken), 200, NO_STORE);
});
