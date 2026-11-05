import { putNotificationContactSchema } from "@/lib/identity/schemas/notification-contact";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { NotificationContactController } from "@/features/identity/notificationContactController";

// Patientens e-mail og telefonnummer til notifikationer (identity 10.16). Kun patienter med konto; værdierne logges aldrig.
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = requireAccount(await requireRole("patient", { allowAnonymous: true, ctx: gate }), ACCOUNT_REQUIRED_MESSAGES.notificationContact);
  return jsonResponse(await new NotificationContactController(gate.supabase, session).getMine());
});

export const PUT = withApi(async (req) => {
  const gate = await requireTerms();
  const session = requireAccount(await requireRole("patient", { allowAnonymous: true, ctx: gate }), ACCOUNT_REQUIRED_MESSAGES.notificationContact);
  const input = await readJson(req, putNotificationContactSchema);
  return jsonResponse(await new NotificationContactController(gate.supabase, session).saveMine(input));
});
