import { BookingsController } from "@/features/booking/bookingsController";
import { bookingsQuerySchema } from "@/lib/booking/schemas/bookings";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, parseId, readQuery, withApi } from "@/platform/middleware/http";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Ledige tider til at flytte en booket tid (architecture 10.16): samme klinik og behandling som bookingen. Kun for
// patienten bag en booket tid før starttid; højst 14 dage pr. kald (6.7). 409 BOOKING_NOT_RESCHEDULABLE.
export const GET = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    ACCOUNT_REQUIRED_MESSAGES.bookSlot,
  );
  const bookingId = parseId((await params).id);
  const query = readQuery(req, bookingsQuerySchema, ["from", "to"]);
  return jsonResponse(await new BookingsController(gate.supabase, session).availabilityForBooking(bookingId, query));
});
