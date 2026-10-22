import type { BookingStatus } from "@/lib/booking/types/bookings";
import type { BadgeTone } from "@/components/ui/badge";

// Badge-tonen for bookingens status. Samme for patientens og klinikkens visning.
export const BOOKING_STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  held: "warning",
  booked: "brand",
  completed: "neutral",
  no_show: "danger",
  cancelled: "neutral",
};
