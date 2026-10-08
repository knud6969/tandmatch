import { summarySchema } from "@/lib/schemas/requests";
import { jsonResponse, parseId, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { approveSummaryText, generateSummaryDraft } from "@/controllers/summaryController";

type Ctx = { params: Promise<{ id: string }> };

// Udkast fra AI (architecture 10.4). Patienten godkender altid bagefter via PUT, før tandlæger kan se den.
export const POST = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await generateSummaryDraft(supabase, session, requestId));
});

// Patienten godkender opsummeringen. Det er den tandlæger ser, og den er påkrævet før afsendelse.
export const PUT = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, summarySchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await approveSummaryText(supabase, session, requestId, input.summaryText));
});
