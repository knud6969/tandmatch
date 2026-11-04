import { z } from "zod";

// Alle felter påkrævet; ukendte felter afvises.
export const notificationSettingsSchema = z
  .object({
    emailNewLead: z.boolean(),
    emailNewMessage: z.boolean(),
    emailBookingChanges: z.boolean(),
    emailBookingReminder: z.boolean(),
    webPushNewLead: z.boolean(),
    webPushNewMessage: z.boolean(),
    webPushBookingChanges: z.boolean(),
    webPushBookingReminder: z.boolean(),
  })
  .strict();
