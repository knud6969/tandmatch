import { ReviewsController } from "@/controllers/reviewsController";
import { jsonResponse, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Patientens egne anmeldelser med moderationsstatus (architecture 10.13).
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  return jsonResponse(await new ReviewsController(gate.supabase, session).mine());
});
