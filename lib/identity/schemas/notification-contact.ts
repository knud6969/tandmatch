import { z } from "zod";
import { phoneSchema } from "@/lib/common/schemas/phone";

// Patientens e-mail til notifikationer. Spejler check constraint på patient_notification_contacts.email (identity 4.3).
export const notificationEmailSchema = z
  .string()
  .trim()
  .max(254, "Angiv en gyldig e-mailadresse.")
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Angiv en gyldig e-mailadresse.");

// PUT /api/patients/me/notification-contact: begge felter sættes; null rydder feltet (så sendes der ikke på den kanal, og for
// e-mail bruges login-adressen).
export const putNotificationContactSchema = z
  .object({
    email: notificationEmailSchema.nullable(),
    phone: phoneSchema.nullable(),
  })
  .strict();

export type PutNotificationContactInput = z.infer<typeof putNotificationContactSchema>;
