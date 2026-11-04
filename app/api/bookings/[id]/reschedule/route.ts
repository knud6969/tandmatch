import { BookingsController } from "@/features/booking/bookingsController";
import { BOOKING_IP_LIMIT_PER_HOUR } from "@/lib/common/constants/limits";
import { rescheduleBookingSchema } from "@/lib/booking/schemas/bookings";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Patienten flytter en booket tid til en anden ledig tid hos samme klinik (architecture 10.16). Svaret er den nye booking.
// 409 BOOKING_NOT_RESCHEDULABLE, SLOT_TAKEN, SLOT_UNAVAILABLE, CLINIC_NOT_AVAILABLE, BOOKING_LIMIT; 429 RATE_LIMITED.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    ACCOUNT_REQUIRED_MESSAGES.bookSlot,
  );
  await enforceIpRateLimit("booking", req, BOOKING_IP_LIMIT_PER_HOUR);
  const bookingId = parseId((await params).id);
  const input = await readJson(req, rescheduleBookingSchema);
  return jsonResponse(await new BookingsController(gate.supabase, session).reschedule(bookingId, input));
}, { notify: true });
