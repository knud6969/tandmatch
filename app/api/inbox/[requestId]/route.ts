import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, withApi } from "@/server/http/api";
import { getInboxDetail } from "@/server/services/inbox";

type Ctx = { params: Promise<{ requestId: string }> };

// Detalje for én forespørgsel sendt til tandlægen (architecture 10.6). Kun modtagere og kun verificerede tandlæger.
export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const requestId = parseId((await ctx.params).requestId);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getInboxDetail(supabase, session.userId, requestId));
});
