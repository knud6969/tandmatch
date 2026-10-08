import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, parseId, withApi } from "@/middleware/http";
import { getStandardDentistProfile } from "@/controllers/standardTrackController";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const dentistId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getStandardDentistProfile(supabase, dentistId));
});
