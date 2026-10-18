import { BookingsController } from "@/controllers/bookingsController";
import { bookingsQuerySchema } from "@/lib/schemas/bookings";
import { jsonResponse, readQuery, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

// Patientens egne bookinger, eller klinikkens kalender (?from=&to=, kun verificerede klinikker) (architecture 10.10).
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole(["patient", "clinic"], { ctx: gate });
  const query = readQuery(req, bookingsQuerySchema, ["from", "to"]);
  return jsonResponse({ bookings: await new BookingsController(gate.supabase, session).list(query) });
});
