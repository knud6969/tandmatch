import { BookingsController } from "@/controllers/bookingsController";
import { bookSlotSchema } from "@/lib/schemas/bookings";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { requireAccount, requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Patienten booker en tid på et accepteret lead (architecture 10.10). 409 SLOT_TAKEN, LEAD_NOT_ACCEPTED, SLOT_UNAVAILABLE.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    ACCOUNT_REQUIRED_MESSAGES.bookSlot,
  );
  const leadId = parseId((await params).id);
  const input = await readJson(req, bookSlotSchema);
  return jsonResponse(await new BookingsController(gate.supabase, session).book(leadId, input), 201);
});
