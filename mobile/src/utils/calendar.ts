// Den gamle indgang: i expo-calendar 58 kaster hovedindgangens isAvailableAsync og createEventInCalendarAsync altid.
import * as Calendar from "expo-calendar/legacy";
import { bookingCalendarEvent } from "@/lib/booking/domain/calendar-event";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";

// Tilføj til kalender (mobile 13.11): åbner iOS' egen "Ny begivenhed"-skærm udfyldt med tiden. Appen læser aldrig
// patientens kalender og gemmer ikke begivenhedens id.

// Er kalenderen til rådighed på enheden? Fejl tæller som nej, så knappen blot ikke vises.
export async function isCalendarAvailable(): Promise<boolean> {
  try {
    return await Calendar.isAvailableAsync();
  } catch {
    return false;
  }
}

// Åbner systemets skærm. Patienten vælger kalender og trykker selv "Tilføj" (eller annullerer).
export async function addBookingToCalendar(booking: Pick<PatientBookingDto, "clinic" | "startsAt" | "endsAt">): Promise<void> {
  await Calendar.createEventInCalendarAsync(bookingCalendarEvent(booking));
}
