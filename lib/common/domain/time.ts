import { CLINIC_TIME_ZONE } from "@/lib/booking/constants/bookings";

export const DAY_MS = 24 * 60 * 60 * 1000;

const monthFormat = new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE, year: "numeric", month: "2-digit" });

// Måneden for et tidsstempel som "YYYY-MM" i dansk tid (architecture 10.13).
export function toClinicMonth(timestamp: string | Date): string {
  const parts = monthFormat.formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
}

const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

// Datoen for et tidsstempel som "YYYY-MM-DD" i dansk tid (fx besøgsdatoen i 10.13).
export function toClinicDate(timestamp: string | Date): string {
  const parts = dateFormat.formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
