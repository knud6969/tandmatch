import { BookingsController } from "@/features/booking/bookingsController";
import { leadAvailabilityQuerySchema } from "@/lib/booking/schemas/bookings";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, parseId, readQuery, withApi } from "@/platform/middleware/http";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Ledige tider hos leadets klinik for en af sagens behandlinger (architecture 10.10), højst 14 dage pr. kald (6.7). Patienten
// bag et accepteret lead; eller klinikken på et ubesvaret akut-lead, så den kan foreslå en tid (10.11).
export const GET = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const caller = await requireRole(["patient", "clinic"], { allowAnonymous: true, ctx: gate });
  const session = caller.role === "patient" ? requireAccount(caller, ACCOUNT_REQUIRED_MESSAGES.bookSlot) : caller;
  const leadId = parseId((await params).id);
  const query = readQuery(req, leadAvailabilityQuerySchema, ["serviceId", "from", "to"]);
  return jsonResponse(await new BookingsController(gate.supabase, session).availabilityForLead(leadId, query));
});
