import type {
  CLINIC_NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  PATIENT_CONTACT_NOTIFICATION_TYPES,
  PATIENT_NOTIFICATION_TYPES,
} from "@/lib/common/constants/notifications";

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type ClinicNotificationType = (typeof CLINIC_NOTIFICATION_TYPES)[number];
export type PatientNotificationType = (typeof PATIENT_NOTIFICATION_TYPES)[number];
export type PatientContactNotificationType = (typeof PATIENT_CONTACT_NOTIFICATION_TYPES)[number];
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

// Én notifikation i klokken (platform 14.11): færdig dansk tekst, intern sti og læst-tidspunkt. Ingen id'er ud over rækkens eget.
export type NotificationItemDto = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  path: string;
  readAt: string | null;
  createdAt: string;
};

// Svaret fra GET /api/notifications: de nyeste og antallet af ulæste (højst INBOX_UNREAD_CAP).
export type NotificationInboxDto = { items: NotificationItemDto[]; unreadCount: number };
