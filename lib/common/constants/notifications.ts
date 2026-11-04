// Notifikationer (platform 14). Typerne og tallene skal svare til databasen (SQL: enum notification_type,
// notification_channel, notification_status, notification_outbox og triggerne i supabase/migrations/20261105000200_notification_outbox.sql).
// Ændres altid begge steder i samme commit (beslutninger 12.2). Teksterne er faste: ingen helbredsdata, navne eller beskedtekst.

export const CLINIC_NOTIFICATION_TYPES = [
  "clinic_new_lead",
  "clinic_new_message",
  "clinic_booking_created",
  "clinic_booking_cancelled",
  "clinic_booking_rescheduled",
  "clinic_booking_reminder",
] as const;

export const PATIENT_NOTIFICATION_TYPES = [
  "patient_lead_answered",
  "patient_new_message",
  "patient_booking_confirmed",
  "patient_booking_cancelled",
  "patient_booking_reminder",
] as const;

export const NOTIFICATION_TYPES = [...CLINIC_NOTIFICATION_TYPES, ...PATIENT_NOTIFICATION_TYPES] as const;

// email og web_push går til klinikken, push (Expo) til patientens app.
export const NOTIFICATION_CHANNELS = ["email", "push", "web_push"] as const;
export const NOTIFICATION_STATUSES = ["pending", "sending", "sent", "failed", "skipped"] as const;

export const NOTIFY_MESSAGE_THROTTLE_MIN = 15; // (SQL) højst én besked-notifikation pr. lead, type og kanal pr. 15 min
export const NOTIFY_MAX_ATTEMPTS = 5; // (SQL) forsøg før en række opgives
export const NOTIFY_LOCK_MINUTES = 2; // (SQL) lås ved claim
export const NOTIFY_RETENTION_DAYS = 30; // (SQL) afsluttede rækker slettes af purge_notifications()
export const NOTIFY_RETRY_DELAY_MIN = [1, 5, 15, 60] as const; // (SQL) udskydelse efter 1.-4. fejlede forsøg
export const BOOKING_REMINDER_HOURS = 24; // (SQL) påmindelse højst så mange timer før starttid

// Nøglerne, payload må indeholde (SQL: check-constraint notification_outbox_payload_check): id'er og ISO-tidspunkter.
export const NOTIFICATION_PAYLOAD_KEYS = ["caseId", "leadId", "bookingId", "startsAt", "previousStartsAt", "holdExpiresAt"] as const;

export const NOTIFICATION_TITLE = "TandMatch";

// E-mailens emne, brødtekst og linje før linket. {tid} og {gammel}/{ny} udfyldes med dansk dato og tid.
export const CLINIC_EMAIL_TEXTS = {
  clinic_new_lead: {
    subject: "Ny henvendelse på TandMatch",
    body: "Du har en ny henvendelse på TandMatch. Se den og svar her:",
  },
  clinic_new_message: {
    subject: "Ny besked på TandMatch",
    body: "Du har en ny besked fra en patient på TandMatch. Læs den her:",
  },
  clinic_booking_created: {
    subject: "Ny booking på TandMatch",
    body: "En patient har booket en tid hos jer {tid}. Se bookingen her:",
  },
  clinic_booking_cancelled: {
    subject: "Aflyst tid på TandMatch",
    body: "En patient har aflyst tiden {tid}. Tiden er ledig igen i jeres kalender.",
  },
  clinic_booking_rescheduled: {
    subject: "Flyttet tid på TandMatch",
    body: "En patient har flyttet en tid fra {gammel} til {ny}.",
  },
  clinic_booking_reminder: {
    subject: "Påmindelse: booket tid i morgen",
    body: "I har en booket tid via TandMatch {tid}.",
  },
} as const satisfies Record<(typeof CLINIC_NOTIFICATION_TYPES)[number], { subject: string; body: string }>;

// Emnet for et akut lead: klinikken skal svare inden reservationen udløber.
export const CLINIC_URGENT_LEAD_SUBJECT = "Ny henvendelse på TandMatch – svar inden kl. {tid}";

// Fodnoten i alle e-mails. {indstillinger} er linket til /klinik/profil#notifikationer.
export const CLINIC_EMAIL_FOOTER =
  "Du får denne e-mail, fordi jeres klinik er oprettet på TandMatch. I kan slå e-mails fra under Klinikprofil → Notifikationer: {indstillinger}. Svar ikke på denne e-mail.";

// Push til patientens app. Ingen kliniknavn og ingen ydelse (låseskærmen).
export const PATIENT_PUSH_TEXTS = {
  patient_lead_answered: "Klinikken har svaret på din henvendelse.",
  patient_new_message: "Du har en ny besked fra klinikken.",
  patient_booking_confirmed: "Klinikken har bekræftet din tid.",
  patient_booking_cancelled: "Klinikken har aflyst din tid. Åbn appen for at se mere.",
  patient_booking_reminder: "Påmindelse: Du har en tandlægetid i morgen kl. {tid}.",
} as const satisfies Record<(typeof PATIENT_NOTIFICATION_TYPES)[number], string>;

// Stier (sidst i linket i e-mailen og i web push). {leadId} osv. udfyldes med id'er.
export const CLINIC_LEAD_PATH = "/klinik/lead/";
export const CLINIC_CALENDAR_PATH = "/klinik/kalender";
export const CLINIC_NOTIFICATION_SETTINGS_PATH = "/klinik/profil#notifikationer";
