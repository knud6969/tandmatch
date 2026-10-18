import { BookingsController } from "@/controllers/bookingsController";
import { leadAvailabilityQuerySchema } from "@/lib/schemas/bookings";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, parseId, readQuery, withApi } from "@/middleware/http";
import { requireAccount, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Ledige tider hos leadets klinik for en af sagens behandlinger (architecture 10.10). Kun for patienten bag et accepteret
// lead; højst 14 dage pr. kald (6.7).
export const GET = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    ACCOUNT_REQUIRED_MESSAGES.bookSlot,
  );
  const leadId = parseId((await params).id);
  const query = readQuery(req, leadAvailabilityQuerySchema, ["serviceId", "from", "to"]);
  return jsonResponse(await new BookingsController(gate.supabase, session).availabilityForLead(leadId, query));
});
