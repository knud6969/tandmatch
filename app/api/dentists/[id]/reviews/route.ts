import { requireTerms } from "@/server/auth/terms";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, withApi } from "@/server/http/api";
import { getPublicReviews } from "@/server/services/standard-track";

type Ctx = { params: Promise<{ id: string }> };

// Kun godkendte anmeldelser og godkendte svar (architecture 10.9).
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const dentistId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getPublicReviews(supabase, dentistId));
});
