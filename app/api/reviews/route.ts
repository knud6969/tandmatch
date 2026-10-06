import { createReviewSchema } from "@/lib/schemas/standard";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, readJson, withApi } from "@/server/http/api";
import { submitReview } from "@/server/services/reviews";

// Patienten anmelder et verificeret besøg. Status er pending til moderation (architecture 8.5, 10.9).
export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient");
  const input = await readJson(req, createReviewSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await submitReview(supabase, session.userId, input), 201);
});
