import { markNotificationsReadSchema } from "@/lib/common/schemas/notifications";
import { noContent, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { NotificationInboxController } from "@/platform/notifications/notificationInboxController";

// Marker notifikationer som læst: de angivne `ids`, eller alle egne uden `ids` (platform 14.11). 204 også for fremmede id'er.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole(["clinic", "patient"], { ctx: gate });
  const input = await readJson(req, markNotificationsReadSchema);
  await new NotificationInboxController(gate.supabase, session).markRead(input.ids);
  return noContent();
});
