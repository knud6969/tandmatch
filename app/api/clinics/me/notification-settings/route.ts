import { notificationSettingsSchema } from "@/lib/clinics/schemas/notification-settings";
import { jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { NotificationSettingsController } from "@/features/clinics/notificationSettingsController";

// Klinikkens valg af e-mail og browser-notifikationer (clinics 10.19). Også for oprettede (registered) klinikker.
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  return jsonResponse(await new NotificationSettingsController(gate.supabase, session).get());
});

export const PUT = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const input = await readJson(req, notificationSettingsSchema);
  return jsonResponse(await new NotificationSettingsController(gate.supabase, session).put(input));
});
