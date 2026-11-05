import { PUSH_TOKEN_IP_LIMIT_PER_HOUR } from "@/lib/common/constants/limits";
import { deletePushTokenSchema, registerPushTokenSchema } from "@/lib/identity/schemas/push-tokens";
import { noContent, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { createAuthContext, requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { PushTokensController } from "@/features/identity/pushTokensController";

// Patientens enhed til push (identity 10.15). Kun patienter med konto; tokenet logges aldrig.
export const PUT = withApi(async (req) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    "Opret en konto for at få notifikationer.",
  );
  await enforceIpRateLimit("push-token", req, PUSH_TOKEN_IP_LIMIT_PER_HOUR);
  const input = await readJson(req, registerPushTokenSchema);
  await new PushTokensController(gate.supabase, session).register(input);
  return noContent();
});

// Afmelding (ved logout og når notifikationer slås fra). 204 altid, også når tokenet ikke findes eller tilhører en anden; sletter
// kun egne rækker. Undtaget fra vilkårs-gaten (security L3): kræver session og rolle, men ikke en gældende vilkårsaccept, så en
// patient med en forældet accept stadig kan afmelde enheden. Afmelding giver ingen adgang til data og fjerner kun en enhed.
export const DELETE = withApi(async (req) => {
  const ctx = await createAuthContext();
  const session = await requireRole("patient", { allowAnonymous: true, ctx });
  const input = await readJson(req, deletePushTokenSchema);
  await new PushTokensController(ctx.supabase, session).remove(input.token);
  return noContent();
});
