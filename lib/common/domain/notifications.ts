// Rene funktioner til notifikationernes indhold (platform 14.7). Deles af serveren og appen; ingen I/O.
// Funktionerne får kun NotificationPayload (id'er og tidspunkter) og kan derfor aldrig få helbredsdata, navne,
// kontaktoplysninger eller beskedtekst med (GDPR art. 9).
import {
  CLINIC_CALENDAR_PATH,
  CLINIC_EMAIL_FOOTER,
  CLINIC_EMAIL_TEXTS,
  CLINIC_URGENT_LEAD_SUBJECT,
  CLINIC_LEAD_PATH,
  CLINIC_NOTIFICATION_SETTINGS_PATH,
  CLINIC_NOTIFICATION_TYPES,
  NOTIFICATION_PAYLOAD_KEYS,
  NOTIFICATION_TITLE,
  PATIENT_NOTIFICATION_TYPES,
  PATIENT_PUSH_TEXTS,
} from "@/lib/common/constants/notifications";
import { formatDay, formatTime } from "@/lib/common/domain/format";
import type {
  ClinicNotificationType,
  NotificationPayload,
  NotificationType,
  PatientNotificationType,
  RenderedEmail,
  RenderedPush,
} from "@/lib/common/types/notifications";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_RE = new RegExp(`^${UUID}$`);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const ID_KEYS = ["caseId", "leadId", "bookingId"] as const;
const TIME_KEYS = ["startsAt", "previousStartsAt", "holdExpiresAt"] as const;

export function isClinicNotificationType(type: NotificationType): type is ClinicNotificationType {
  return (CLINIC_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

export function isPatientNotificationType(type: NotificationType): type is PatientNotificationType {
  return (PATIENT_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

// Fra en ukendt jsonb-værdi til et payload med kun de tilladte nøgler og gyldige værdier. Alt andet kasseres.
export function parseNotificationPayload(raw: unknown): NotificationPayload {
  const out: NotificationPayload = {};
  if (typeof raw !== "object" || raw === null) return out;
  const source = raw as Record<string, unknown>;
  for (const key of NOTIFICATION_PAYLOAD_KEYS) {
    const value = source[key];
    if (typeof value !== "string") continue;
    if ((ID_KEYS as readonly string[]).includes(key) && UUID_RE.test(value)) out[key] = value.toLowerCase();
    if ((TIME_KEYS as readonly string[]).includes(key) && ISO_RE.test(value) && !Number.isNaN(Date.parse(value))) out[key] = value;
  }
  return out;
}

function need(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`payload mangler ${name}`);
  return value;
}

// "tirsdag 14. oktober kl. 09.15" i dansk tid.
function when(iso: string): string {
  return `${formatDay(iso)} kl. ${formatTime(iso)}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Basisadressen uden sti og afsluttende skråstreg. Kun http(s).
function origin(siteUrl: string): string {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("siteUrl skal være http(s)");
  return url.origin;
}

// Emne og brødtekst (uden link) for en klinik-notifikation. Deles af e-mailen og web push.
function clinicParts(type: ClinicNotificationType, payload: NotificationPayload): { subject: string; body: string } {
  const texts = CLINIC_EMAIL_TEXTS[type];
  switch (type) {
    case "clinic_new_lead": {
      const t = CLINIC_EMAIL_TEXTS.clinic_new_lead;
      return {
        subject: payload.holdExpiresAt ? CLINIC_URGENT_LEAD_SUBJECT.replace("{tid}", formatTime(payload.holdExpiresAt)) : t.subject,
        body: t.body,
      };
    }
    case "clinic_booking_created":
    case "clinic_booking_cancelled":
    case "clinic_booking_reminder":
      return { subject: texts.subject, body: texts.body.replace("{tid}", when(need(payload.startsAt, "startsAt"))) };
    case "clinic_booking_rescheduled":
      return {
        subject: texts.subject,
        body: texts.body
          .replace("{gammel}", when(need(payload.previousStartsAt, "previousStartsAt")))
          .replace("{ny}", when(need(payload.startsAt, "startsAt"))),
      };
    default:
      return { subject: texts.subject, body: texts.body };
  }
}

// Stien i klinik-weben, som en klinik-notifikation peger på: henvendelsen eller kalenderen.
export function clinicNotificationPath(type: ClinicNotificationType, payload: NotificationPayload): string {
  if (type === "clinic_new_lead" || type === "clinic_new_message") return `${CLINIC_LEAD_PATH}${need(payload.leadId, "leadId")}`;
  // Bookingerne vises i kalenderen.
  return CLINIC_CALENDAR_PATH;
}

// E-mail til klinikken (platform 14.2). Tekst- og HTML-del; alt i HTML escapes. Ingen billeder, sporing eller eksterne ressourcer.
export function renderClinicEmail(type: ClinicNotificationType, payload: NotificationPayload, siteUrl: string): RenderedEmail {
  const base = origin(siteUrl);
  const { subject, body } = clinicParts(type, payload);
  // Alle e-mails linker til henvendelsen (platform 14.2), hvor klinikken er logget ind.
  const link = `${base}${CLINIC_LEAD_PATH}${need(payload.leadId, "leadId")}`;
  const settings = `${base}${CLINIC_NOTIFICATION_SETTINGS_PATH}`;
  const footer = CLINIC_EMAIL_FOOTER.replace("{indstillinger}", settings);
  const text = `${body}\n${link}\n\n${footer}`;
  const html =
    `<!doctype html><html lang="da"><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5">` +
    `<p>${escapeHtml(body)}</p>` +
    `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` +
    `<hr style="border:none;border-top:1px solid #ddd">` +
    `<p style="font-size:13px;color:#555">${escapeHtml(footer).replace(escapeHtml(settings), `<a href="${escapeHtml(settings)}">${escapeHtml(settings)}</a>`)}</p>` +
    `</body></html>`;
  return { subject, text, html };
}

// Web push til klinikken i browseren: samme generiske tekst som e-mailens emne og en intern sti.
export function renderClinicWebPush(type: ClinicNotificationType, payload: NotificationPayload): RenderedPush {
  return { title: NOTIFICATION_TITLE, body: clinicParts(type, payload).subject };
}

// Push til patientens app (platform 14.2): titel "TandMatch" og en fast tekst.
export function renderPatientPush(type: PatientNotificationType, payload: NotificationPayload): RenderedPush {
  const template = PATIENT_PUSH_TEXTS[type];
  const body = type === "patient_booking_reminder" ? template.replace("{tid}", formatTime(need(payload.startsAt, "startsAt"))) : template;
  return { title: NOTIFICATION_TITLE, body };
}

// Stien i appen, en patient-notifikation åbner (mobile 13.10).
export function patientNotificationPath(type: PatientNotificationType, payload: NotificationPayload): string {
  switch (type) {
    case "patient_lead_answered":
      return `/sag/${need(payload.caseId, "caseId")}`;
    case "patient_new_message":
      return `/sag/${need(payload.caseId, "caseId")}/beskeder/${need(payload.leadId, "leadId")}`;
    default:
      return "/bookinger";
  }
}

const APP_PATHS = [new RegExp(`^/sag/${UUID}$`), new RegExp(`^/sag/${UUID}/beskeder/${UUID}$`), /^\/bookinger$/];
const CLINIC_PATHS = [new RegExp(`^/klinik/lead/${UUID}$`), /^\/klinik\/kalender$/];

// Appen åbner kun stier fra denne liste (ingen vilkårlige links, ingen forespørgselsstreng).
export function isAllowedNotificationPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 200 && APP_PATHS.some((re) => re.test(path));
}

// Det samme for web push på klinik-weben: service workeren åbner kun disse stier.
export function isAllowedClinicNotificationPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 200 && CLINIC_PATHS.some((re) => re.test(path));
}
