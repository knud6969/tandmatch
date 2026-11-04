import { useCalendarAvailable } from "~/hooks/use-calendar-available";
import { Button } from "~/components/ui";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import { addBookingToCalendar } from "~/utils/calendar";
import { canAddToCalendar } from "~/utils/calendar-button";

// Sekundær knap, der åbner systemets "Ny begivenhed" (mobile 13.11). Skjult, når kalenderen ikke er tilgængelig.
export function AddToCalendarButton({ booking }: { booking: PatientBookingDto }) {
  const available = useCalendarAvailable();
  if (!canAddToCalendar(booking, available)) return null;
  return (
    <Button
      label="Tilføj til kalender"
      variant="secondary"
      accessibilityLabel={`Tilføj tiden hos ${booking.clinic.name} til kalenderen`}
      onPress={() => void addBookingToCalendar(booking).catch(() => undefined)}
    />
  );
}
