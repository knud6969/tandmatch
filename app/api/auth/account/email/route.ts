import { changeEmailSchema } from "@/lib/identity/schemas/auth";
import { jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { requireWebClient, siteOrigin } from "@/platform/middleware/web";
import { AccountController } from "@/features/identity/accountController";

// Skift login-e-mail (architecture 10.2). Kræver den nuværende adgangskode; svarer ens, om adressen er i brug eller ej.
export const POST = withApi(async (req) => {
  requireWebClient(req);
  const gate = await requireTerms();
  await requireRole("clinic", { ctx: gate });
  await enforceIpRateLimit("account-email", req);
  const input = await readJson(req, changeEmailSchema);
  await new AccountController(gate.supabase).changeEmail(input, `${siteOrigin(req)}/login?besked=email-bekraeftet`);
  return jsonResponse({ sent: true }, 202);
});
