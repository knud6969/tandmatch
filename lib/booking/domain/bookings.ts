import { NO_SHOW_GRACE_HOURS } from "@/lib/booking/constants/bookings";
import type { BookingStatus } from "@/lib/booking/types/bookings";

// Regler for, hvad en booking kan bruges til lige nu (architecture 4.2, 10.10). Statussen er altid den effektive fra
// databasen. Reglerne spejler cancel_booking(), mark_booking_no_show() og effective_booking_status(); databasen er vogteren,
// funktionerne her afgør kun, hvilke knapper DTO'erne tilbyder.

const HOUR_MS = 60 * 60 * 1000;

// Fristen for udeblivelse (og for at bookingen er gennemført): ends_at + 24 timer.
export function graceEndsAt(endsAt: string | Date): Date {
  return new Date(new Date(endsAt).getTime() + NO_SHOW_GRACE_HOURS * HOUR_MS);
}

// Patient og klinik kan kun aflyse en booket tid før starttid (ikke en held-reservation, som frigives ved afvisning,
// tilbagetrækning eller udløb).
export function canCancel(status: BookingStatus, startsAt: string | Date, now: Date = new Date()): boolean {
  return status === "booked" && new Date(startsAt).getTime() > now.getTime();
}

// Klinikken kan registrere udeblivelse fra starttid til 24 timer efter sluttid.
export function canMarkNoShow(status: BookingStatus, startsAt: string | Date, endsAt: string | Date, now: Date = new Date()): boolean {
  return status === "booked" && new Date(startsAt).getTime() <= now.getTime() && now.getTime() < graceEndsAt(endsAt).getTime();
}

// Patienten kan anmelde først, når bookingen er gennemført (ends_at + 24 timer) og kun én gang pr. booking.
export function canReview(status: BookingStatus, endsAt: string | Date, reviewed: boolean, now: Date = new Date()): boolean {
  return status === "completed" && !reviewed && now.getTime() >= graceEndsAt(endsAt).getTime();
}

// Den booking et lead viser: en aktiv (held eller booked) hvis der er en, ellers den nyeste (samme valg som
// clinic_lead_detail() for klinikken). Listen kan være i vilkårlig rækkefølge.
export function pickLeadBooking<T extends { status: BookingStatus; createdAt: string }>(bookings: readonly T[]): T | null {
  const active = (booking: T) => booking.status === "held" || booking.status === "booked";
  let best: T | null = null;
  for (const booking of bookings) {
    if (
      best === null ||
      (active(booking) && !active(best)) ||
      (active(booking) === active(best) && Date.parse(booking.createdAt) > Date.parse(best.createdAt))
    ) {
      best = booking;
    }
  }
  return best;
}
