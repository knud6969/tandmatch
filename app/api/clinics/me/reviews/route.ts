import { ReviewsController } from "@/controllers/reviewsController";
import { jsonResponse, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

// Klinikkens godkendte anmeldelser med eget svar og dets status (architecture 10.8, 10.13).
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  return jsonResponse(await new ReviewsController(gate.supabase, session).listForClinic());
});
