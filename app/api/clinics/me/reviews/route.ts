import { ReviewsController } from "@/features/booking/reviewsController";
import { jsonResponse, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Klinikkens godkendte anmeldelser med eget svar og dets status (architecture 10.8, 10.13).
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  return jsonResponse(await new ReviewsController(gate.supabase, session).listForClinic());
});
