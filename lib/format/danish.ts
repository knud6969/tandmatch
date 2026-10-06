// Formatering af datoer, beløb og afstande til dansk visning. Alle tidspunkter vises i dansk tid.
const TIME_ZONE = "Europe/Copenhagen";

const dateFormat = new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
const krFormat = new Intl.NumberFormat("da-DK");
const kmFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Dato uden klokkeslæt. YYYY-MM-DD (fx tilbuds-gyldighed) læses som middag, så dagen ikke flytter sig.
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

// Værdi til <input type="datetime-local"> i browserens lokale tid.
export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Omvendt: fra datetime-local til ISO 8601 (UTC). Ugyldig værdi returneres uændret, så zod kan afvise den.
export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
