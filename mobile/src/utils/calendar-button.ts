import type { PatientBookingDto } from "@/lib/booking/types/bookings";

// "Tilføj til kalender" vises kun for en booket tid før starttid, og kun når enheden har en kalender (13.11).
export function canAddToCalendar(booking: Pick<PatientBookingDto, "status" | "startsAt">, available: boolean, now: Date = new Date()): boolean {
  return available && booking.status === "booked" && new Date(booking.startsAt).getTime() > now.getTime();
}
