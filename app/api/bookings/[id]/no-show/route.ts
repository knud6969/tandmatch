import { BookingsController } from "@/controllers/bookingsController";
import { emptyBookingActionSchema } from "@/lib/schemas/bookings";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Klinikken registrerer udeblivelse fra starttid til 24 timer efter sluttid (architecture 10.10). 409 NO_SHOW_WINDOW_CLOSED.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const bookingId = parseId((await params).id);
  await readJson(req, emptyBookingActionSchema);
  return jsonResponse(await new BookingsController(gate.supabase, session).markNoShow(bookingId));
});
