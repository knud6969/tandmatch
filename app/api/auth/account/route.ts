import { NO_STORE, jsonResponse, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { requireWebClient } from "@/platform/middleware/web";
import { AccountController } from "@/features/identity/accountController";

// Klinikkens login-e-mail (architecture 10.2).
export const GET = withApi(async (req) => {
  requireWebClient(req);
  const gate = await requireTerms();
  await requireRole("clinic", { ctx: gate });
  return jsonResponse(await new AccountController(gate.supabase).get(), 200, NO_STORE);
});
