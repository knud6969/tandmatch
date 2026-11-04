import type { PatientBookingDto } from "@/lib/booking/types/bookings";

// Begivenheden, der foreslås i patientens kalender (mobile 13.11). Kun klinikkens navn, tidspunkt og sted: ingen behandling
// og ingen andre helbredsoplysninger, fordi kalendere synkroniseres og deles (12.3 punkt 52).
export const CALENDAR_EVENT_NOTES = "Booket via TandMatch. Flyt eller aflys tiden i TandMatch-appen.";
export const CALENDAR_REMINDER_TEXT = "Husk at rette tiden i din kalender, hvis du har tilføjet den.";

export type BookingCalendarEvent = { title: string; startDate: Date; endDate: Date; location: string; notes: string };

export function bookingCalendarEvent(booking: Pick<PatientBookingDto, "clinic" | "startsAt" | "endsAt">): BookingCalendarEvent {
  return {
    title: `Tandlægetid hos ${booking.clinic.name}`,
    startDate: new Date(booking.startsAt),
    endDate: new Date(booking.endsAt),
    location: `${booking.clinic.address}, ${booking.clinic.city}`,
    notes: CALENDAR_EVENT_NOTES,
  };
}
