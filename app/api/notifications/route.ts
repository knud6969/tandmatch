import { jsonResponse, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { NotificationInboxController } from "@/platform/notifications/notificationInboxController";

// Klokken: brugerens nyeste notifikationer og antallet af ulæste (platform 14.11). Klinikker og patienter med konto;
// pollingen i weben og appen bruger den samme route.
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole(["clinic", "patient"], { ctx: gate });
  return jsonResponse(await new NotificationInboxController(gate.supabase, session).list());
});
