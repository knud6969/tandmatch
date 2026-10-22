import { ReviewsController } from "@/controllers/reviewsController";
import { replyReviewSchema } from "@/lib/schemas/reviews";
import { jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Klinikken svarer på en godkendt anmeldelse af sig selv (architecture 10.13). 404 for andres, 409 ALREADY_REPLIED.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const reviewId = parseId((await params).id);
  const input = await readJson(req, replyReviewSchema);
  return jsonResponse(await new ReviewsController(gate.supabase, session).reply(reviewId, input), 201);
});
