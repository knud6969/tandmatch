import { changePasswordSchema } from "@/lib/identity/schemas/auth";
import { noContent, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { requireWebClient } from "@/platform/middleware/web";
import { AccountController } from "@/features/identity/accountController";

// Skift adgangskode (architecture 10.2). Kræver den nuværende; brugerens andre sessioner logges ud.
export const POST = withApi(async (req) => {
  requireWebClient(req);
  const gate = await requireTerms();
  await requireRole("clinic", { ctx: gate });
  await enforceIpRateLimit("account-password", req);
  const input = await readJson(req, changePasswordSchema);
  await new AccountController(gate.supabase).changePassword(input);
  return noContent();
});
