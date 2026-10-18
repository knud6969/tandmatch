import type { BOOKING_STATUSES } from "@/lib/constants/bookings";

// Bookinger (architecture 4.3, 10.10). Her kun det, klinikkens leadvisning bruger; resten kommer med 6.1.
export type BookingStatus = (typeof BOOKING_STATUSES)[number]; // altid effektiv status (4.2)

// Klinikkens visning af en booking. `contact` er kun udfyldt for booked/completed (architecture 5.5), aldrig for held.
export type ClinicBookingDto = {
  id: string;
  leadId: string;
  service: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  contact: { name: string; phone: string; email: string } | null;
  canMarkNoShow: boolean; // starts_at <= nu < ends_at + 24 t
  holdExpiresAt: string | null; // kun held
};
