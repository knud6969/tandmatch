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
  "patient_booking_created",
  "patient_booking_rescheduled",
  "patient_booking_cancelled_self",
  "patient_review_reminder",
] as const;

export const NOTIFICATION_TYPES = [...CLINIC_NOTIFICATION_TYPES, ...PATIENT_NOTIFICATION_TYPES] as const;

// email og web_push går til klinikken; patienten får push (Expo) til appen og, kun om bookinger, email og sms (14.12).
export const NOTIFICATION_CHANNELS = ["email", "push", "web_push", "sms"] as const;
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
  patient_booking_created: "Din tid er booket.",
  patient_booking_rescheduled: "Din tid er flyttet.",
  patient_booking_cancelled_self: "Du har aflyst din tid.",
  patient_review_reminder: "Hvordan var dit besøg? Skriv gerne en anmeldelse.",
} as const satisfies Record<(typeof PATIENT_NOTIFICATION_TYPES)[number], string>;

// Stier (sidst i linket i e-mailen og i web push). {leadId} osv. udfyldes med id'er.
export const CLINIC_LEAD_PATH = "/klinik/lead/";
export const CLINIC_CALENDAR_PATH = "/klinik/kalender";
export const CLINIC_NOTIFICATION_SETTINGS_PATH = "/klinik/profil#notifikationer";

// Appens kort efter første henvendelse og rækken i Konto (mobile 13.10).
export const PUSH_PROMPT_TITLE = "Få besked, når klinikken svarer";
export const PUSH_PROMPT_TEXT =
  "Vi sender en kort besked, når klinikken svarer, skriver eller ændrer din tid. Beskeden indeholder aldrig oplysninger om dit helbred.";
export const PUSH_PROMPT_ENABLE = "Slå notifikationer til";
export const PUSH_PROMPT_DISMISS = "Ikke nu";
export const PUSH_ACCOUNT_TITLE = "Notifikationer";
export const PUSH_ACCOUNT_SWITCH = "Modtag notifikationer";
export const PUSH_DENIED_TEXT = "Slået fra i iPhone-indstillinger";
export const PUSH_OPEN_SETTINGS = "Åbn Indstillinger";

// Notifikationsklokken (platform 14.11): tabellen user_notifications, listens længde og pollingen. Tallene er ikke i SQL.
export const INBOX_LIST_LIMIT = 20; // de nyeste, der vises i klokkens liste
export const INBOX_UNREAD_CAP = 100; // højeste ulæste-tal, API'et tæller til; vises som "99+"
export const INBOX_MARK_MAX_IDS = 100; // (SQL) højst så mange id'er i mark_notifications_read()
export const INBOX_POLL_MS = 30_000; // klokken henter tallet hvert 30. sekund (web: kun mens fanen er synlig)
export const INBOX_RETENTION_DAYS = NOTIFY_RETENTION_DAYS; // (SQL) rækkerne slettes af purge_notifications()

// Klokkens tekster. Titlen på en notifikation er klinikkens e-mailemne eller patientens pushtekst (ingen nye tekster).
export const INBOX_HEADING = "Notifikationer";
export const INBOX_EMPTY_TEXT = "Du har ingen notifikationer endnu.";
export const INBOX_MARK_ALL_READ = "Marker alle som læst";
export const INBOX_BELL_LABEL = "Notifikationer";
export const INBOX_UNREAD_LABEL = "ulæste";
export const INBOX_RESCHEDULED_BODY = "Fra {gammel} til {ny}.";

// Patientens e-mail og SMS om bookinger (platform 14.12). Kun disse syv typer sendes som e-mail og SMS; svar på henvendelse og
// beskeder går kun til klokken og app-push. Teksterne er generiske: aldrig behandling, klinik eller helbredsdata.
export const PATIENT_CONTACT_NOTIFICATION_TYPES = [
  "patient_booking_created",
  "patient_booking_rescheduled",
  "patient_booking_confirmed",
  "patient_booking_cancelled",
  "patient_booking_cancelled_self",
  "patient_booking_reminder",
  "patient_review_reminder",
] as const;

// {tid} udfyldes med "tirsdag 14. oktober kl. 09.15". Mangler tidspunktet i payload, bruges `bodyNoTime`.
export const PATIENT_CONTACT_TEXTS = {
  booked: {
    subject: "Din tid på TandMatch er booket",
    body: "Du har en tid på TandMatch {tid}. Se detaljer i appen.",
    bodyNoTime: "Du har en tid på TandMatch. Se detaljer i appen.",
  },
  cancelled: {
    subject: "Din tid på TandMatch er aflyst",
    body: "Din tid på TandMatch {tid} er aflyst. Se detaljer i appen.",
    bodyNoTime: "Din tid på TandMatch er aflyst. Se detaljer i appen.",
  },
  reminder: {
    subject: "Påmindelse: du har en tid i morgen",
    body: "Du har en tid på TandMatch {tid}. Se detaljer i appen.",
    bodyNoTime: "Du har en tid på TandMatch i morgen. Se detaljer i appen.",
  },
  review: {
    subject: "Hvordan var dit besøg?",
    body: "Du har haft en tid på TandMatch. Skriv gerne en anmeldelse i appen.",
    bodyNoTime: "Du har haft en tid på TandMatch. Skriv gerne en anmeldelse i appen.",
  },
} as const;

export const PATIENT_EMAIL_FOOTER =
  "Du får denne e-mail, fordi du har en konto på TandMatch. Du kan ændre din e-mail og dit telefonnummer under Konto i appen. Svar ikke på denne e-mail.";
export const PATIENT_SMS_PREFIX = "TandMatch: ";

// Konto i appen: e-mail og telefon til notifikationer (identity 10.20).
export const PATIENT_CONTACT_TITLE = "E-mail og SMS om dine tider";
export const PATIENT_CONTACT_HELP =
  "Vi sender en kort besked, når en tid er booket eller aflyst, dagen før din tid og dagen efter, så du kan anmelde besøget. Beskeden indeholder aldrig oplysninger om dit helbred eller din behandling.";
