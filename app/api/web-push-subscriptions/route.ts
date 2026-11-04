import { deleteWebPushSchema, registerWebPushSchema } from "@/lib/clinics/schemas/web-push";
import { WEB_PUSH_IP_LIMIT_PER_HOUR } from "@/lib/common/constants/limits";
import { noContent, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { requireWebClient } from "@/platform/middleware/web";
import { WebPushSubscriptionsController } from "@/features/clinics/webPushSubscriptionsController";

// Klinikejerens browser til web push (clinics 10.19). Kun weben. Endpoint og nøgler logges aldrig.
export const POST = withApi(async (req) => {
  requireWebClient(req);
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  await enforceIpRateLimit("web-push", req, WEB_PUSH_IP_LIMIT_PER_HOUR);
  const input = await readJson(req, registerWebPushSchema);
  await new WebPushSubscriptionsController(gate.supabase, session).register(input);
  return noContent();
});

// Afmelding (ved logout fra browseren). 204 altid; sletter kun egne rækker.
export const DELETE = withApi(async (req) => {
  requireWebClient(req);
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const input = await readJson(req, deleteWebPushSchema);
  await new WebPushSubscriptionsController(gate.supabase, session).remove(input.endpoint);
  return noContent();
});
