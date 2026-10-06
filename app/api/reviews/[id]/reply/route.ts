import { createReplySchema } from "@/lib/schemas/standard";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { submitReviewReply } from "@/server/services/reviews";

type Ctx = { params: Promise<{ id: string }> };

// Den anmeldte tandlæge svarer offentligt. Pending indtil moderation (architecture 10.9).
export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const reviewId = parseId((await ctx.params).id);
  const input = await readJson(req, createReplySchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await submitReviewReply(supabase, session.userId, reviewId, input), 201);
});
