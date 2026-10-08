import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, parseId, withApi } from "@/middleware/http";
import { getPublicReviews } from "@/controllers/standardTrackController";

type Ctx = { params: Promise<{ id: string }> };

// Kun godkendte anmeldelser og godkendte svar (architecture 10.9).
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const dentistId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getPublicReviews(supabase, dentistId));
});
