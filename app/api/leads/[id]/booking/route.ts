import { BookingsController } from "@/controllers/bookingsController";
import { BOOKING_IP_LIMIT_PER_HOUR } from "@/lib/common/constants/limits";
import { bookSlotSchema } from "@/lib/schemas/bookings";
import { ACCOUNT_REQUIRED_MESSAGES, jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireAccount, requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Patienten booker en tid på et accepteret lead (architecture 10.10). 409 SLOT_TAKEN, LEAD_NOT_ACCEPTED, SLOT_UNAVAILABLE, BOOKING_LIMIT; 429 RATE_LIMITED.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true, ctx: gate }),
    ACCOUNT_REQUIRED_MESSAGES.bookSlot,
  );
  await enforceIpRateLimit("booking", req, BOOKING_IP_LIMIT_PER_HOUR);
  const leadId = parseId((await params).id);
  const input = await readJson(req, bookSlotSchema);
  return jsonResponse(await new BookingsController(gate.supabase, session).book(leadId, input), 201);
});
