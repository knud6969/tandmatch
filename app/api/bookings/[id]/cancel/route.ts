import { BookingsController } from "@/features/booking/bookingsController";
import { cancelBookingSchema } from "@/lib/booking/schemas/bookings";
import { jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Patienten eller klinikken aflyser egen booking før starttid (architecture 10.10). Klinikken kan give en kort grund. 409 BOOKING_NOT_CANCELLABLE.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole(["patient", "clinic"], { ctx: gate });
  const bookingId = parseId((await params).id);
  const input = await readJson(req, cancelBookingSchema);
  return jsonResponse(await new BookingsController(gate.supabase, session).cancel(bookingId, input));
});
