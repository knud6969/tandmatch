import { ReviewsController } from "@/features/booking/reviewsController";
import { createReviewSchema } from "@/lib/booking/schemas/reviews";
import { jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Patienten anmelder et gennemført besøg (architecture 10.13). 403 uden gennemført booking, 409 hvis allerede anmeldt.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { ctx: gate });
  const input = await readJson(req, createReviewSchema);
  return jsonResponse(await new ReviewsController(gate.supabase, session).create(input), 201);
});
