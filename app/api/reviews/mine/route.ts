import { ReviewsController } from "@/controllers/reviewsController";
import { jsonResponse, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";

// Patientens egne anmeldelser med moderationsstatus (architecture 10.13).
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  return jsonResponse(await new ReviewsController(gate.supabase, session).mine());
});
