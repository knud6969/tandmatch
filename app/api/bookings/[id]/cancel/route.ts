import { BookingsController } from "@/controllers/bookingsController";
import { emptyBookingActionSchema } from "@/lib/schemas/bookings";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Patienten eller klinikken aflyser egen booking før starttid (architecture 10.10). 409 BOOKING_NOT_CANCELLABLE.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole(["patient", "clinic"], { ctx: gate });
  const bookingId = parseId((await params).id);
  await readJson(req, emptyBookingActionSchema);
  return jsonResponse(await new BookingsController(gate.supabase, session).cancel(bookingId));
});
