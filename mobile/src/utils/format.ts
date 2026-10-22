// Formatering af datoer, beløb og afstande til dansk visning i appen. Alle tidspunkter vises i dansk tid.
// KOPI af de rene dele af platform/ui-utils/format.ts; flyttes til lib/ (architecture 13.2: rene hjælpere deles).
import { CLINIC_TIME_ZONE } from "@/lib/booking/constants/bookings";

// Formattere oprettes én gang; Intl er dyrt at konstruere.
const krFormat = new Intl.NumberFormat("da-DK");
const kmFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const shortDateTime = new Intl.DateTimeFormat("da-DK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CLINIC_TIME_ZONE,
});
const longDate = new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeZone: CLINIC_TIME_ZONE });
const longDateTime = new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short", timeZone: CLINIC_TIME_ZONE });
const monthFormat = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric", timeZone: CLINIC_TIME_ZONE });

export const formatKr = (amount: number) => `${krFormat.format(amount)} kr.`;

// "1.200–1.800 kr." eller "1.200 kr." når min og maks er ens.
export function formatPriceRange(min: number, max: number): string {
  return min === max ? formatKr(min) : `${krFormat.format(min)}–${krFormat.format(max)} kr.`;
}

export const formatKm = (km: number) => `${kmFormat.format(km)} km`;
export const formatOneDecimal = (value: number) => oneDecimal.format(value);
export const formatPercent = (value: number) => `${Math.round(value)} %`;
export const formatShortDateTime = (iso: string) => shortDateTime.format(new Date(iso));
export const formatDateTime = (iso: string) => longDateTime.format(new Date(iso));
export const formatDate = (iso: string) => longDate.format(new Date(iso));

// "2026-10" (API'ets createdMonth) -> "oktober 2026".
export function formatMonth(value: string): string {
  const date = new Date(`${value}-15T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : monthFormat.format(date);
}

// Klokkeslæt fra databasen ("08:00:00") som "08:00".
export const formatClock = (value: string) => value.slice(0, 5);

// Kun http(s)-adresser åbnes (klinikkens website og Trustpilot-link er indtastet af klinikken eller admin).
export function safeWebHref(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const websiteLabel = (href: string) => href.replace(/^https?:\/\//i, "").replace(/\/$/, "");

// tel:-link med kun cifre og plus.
export const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

// Klokkeslæt og dag i dansk tid til bookingen: "09:15", "man. 26. okt." og "2026-10-26" (nøgle til gruppering).
const timeOnly = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: CLINIC_TIME_ZONE });
const dayLabel = new Intl.DateTimeFormat("da-DK", { weekday: "short", day: "numeric", month: "short", timeZone: CLINIC_TIME_ZONE });
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: CLINIC_TIME_ZONE });
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));
export const formatDayLabel = (iso: string) => dayLabel.format(new Date(iso));
export const dayKey = (iso: string) => dayKeyFormat.format(new Date(iso));
