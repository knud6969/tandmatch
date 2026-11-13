import { BookingsController } from "@/features/booking/bookingsController";
import { emptyBookingActionSchema } from "@/lib/booking/schemas/bookings";
import { jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Patienten bekræfter klinikkens foreslåede akuttid (architecture 10.11). 409 HOLD_EXPIRED, når reservationen er udløbet.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  const bookingId = parseId((await params).id);
  await readJson(req, emptyBookingActionSchema);
  return jsonResponse(await new BookingsController(gate.supabase, session).confirm(bookingId));
}, { notify: true });
