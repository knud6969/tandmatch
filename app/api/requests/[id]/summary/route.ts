import { summarySchema } from "@/lib/schemas/requests";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, parseId, readJson, withApi } from "@/server/http/api";
import { requireOwnRequest, updateDraft } from "@/server/models/requests";

type Ctx = { params: Promise<{ id: string }> };

// Patienten godkender opsummeringen. Det er den tandlæger ser, og den er påkrævet før afsendelse.
// Udkast fra AI (POST /summary) bygges af ai-flow-agenten.
export const PUT = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, summarySchema);
  const supabase = await createSupabaseServerClient();
  await requireOwnRequest(supabase, requestId, session.userId);
  const record = await updateDraft(supabase, requestId, {
    summary_text: input.summaryText,
    summary_approved_at: new Date().toISOString(),
  });
  return jsonResponse({
    summaryText: record.summaryText,
    summaryApprovedAt: record.summaryApprovedAt,
  });
});
