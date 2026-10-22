// Formatering af datoer, beløb og afstande til dansk visning. Alle tidspunkter vises i dansk tid.
import { CLINIC_TIME_ZONE as TIME_ZONE } from "@/lib/booking/constants/bookings";

const dateFormat = new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
const krFormat = new Intl.NumberFormat("da-DK");
const kmFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Dato uden klokkeslæt. YYYY-MM-DD læses som middag, så dagen ikke flytter sig.
export function formatDate(value: string): string {
  const date = DATE_ONLY.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return dateFormat.format(date);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatKr(amount: number): string {
  return `${krFormat.format(amount)} kr.`;
}

// Prisinterval i hele kroner, fx "1.200–1.800 kr." eller "1.200 kr." når min og maks er ens.
export function formatPriceRange(min: number, max: number): string {
  if (min === max) return formatKr(min);
  return `${krFormat.format(min)}–${krFormat.format(max)} kr.`;
}

export function formatKm(km: number): string {
  return `${kmFormat.format(km)} km`;
}

// Omvendt: fra datetime-local til ISO 8601 (UTC). Ugyldig værdi returneres uændret, så zod kan afvise den.
export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

const monthFormat = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric", timeZone: TIME_ZONE });
const avgFormat = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// "2026-10" (API'ets createdMonth) -> "oktober 2026".
export function formatMonth(value: string): string {
  const date = new Date(`${value}-15T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : monthFormat.format(date);
}

// Gennemsnit og score med én decimal, fx "4,5".
export function formatOneDecimal(value: number): string {
  return avgFormat.format(value);
}

// Procent uden decimaler, fx "85 %".
export function formatPercent(value: number): string {
  return `${Math.round(value)} %`;
}

// Hele kroner som rå tal (uden "kr."), til felter. Mellemrum og punktum som tusindtalsseparator accepteres.
export function parseWholeKr(value: string): number | null {
  const cleaned = value.trim().replace(/[\s.]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

const shortDateTimeFormat = new Intl.DateTimeFormat("da-DK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const dayFormat = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const dayMonthFormat = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", timeZone: TIME_ZONE });

// "tir. 14. okt., 09.15" til kompakte kort.
export function formatShortDateTime(iso: string): string {
  return shortDateTimeFormat.format(new Date(iso));
}

// "tirsdag 14. oktober" og "09.15".
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

// "15. oktober" (uden ugedag), til tidsrum.
export function formatDayMonth(value: Date | string): string {
  return dayMonthFormat.format(new Date(value));
}

// Klokkeslæt fra databasen ("08:00:00") som "08:00".
export function formatClock(value: string): string {
  return value.slice(0, 5);
}

// Tal med korrekt ental/flertal, fx formatCount(1, "billede", "billeder") -> "1 billede".
export function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
