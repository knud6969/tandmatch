import { requireTerms } from "@/server/auth/terms";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, withApi } from "@/server/http/api";
import { getStandardDentistProfile } from "@/server/services/standard-track";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const dentistId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getStandardDentistProfile(supabase, dentistId));
});
