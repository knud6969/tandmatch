import type { CLINIC_NOTIFICATION_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, PATIENT_NOTIFICATION_TYPES } from "@/lib/common/constants/notifications";

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type ClinicNotificationType = (typeof CLINIC_NOTIFICATION_TYPES)[number];
export type PatientNotificationType = (typeof PATIENT_NOTIFICATION_TYPES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// Det eneste, en renderfunktion kan få: id'er og ISO-tidspunkter (SQL: notification_outbox.payload, platform 14.3).
export type NotificationPayload = {
  caseId?: string;
  leadId?: string;
  bookingId?: string;
  startsAt?: string;
  previousStartsAt?: string;
  holdExpiresAt?: string;
};

// Push til appen: generisk tekst og en intern sti (mobile 13.10).
export type PushData = { type: NotificationType; path: string };

export type RenderedEmail = { subject: string; text: string; html: string };
export type RenderedPush = { title: string; body: string };
