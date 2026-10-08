import { patchRequestSchema } from "@/lib/schemas/requests";
import { jsonResponse, noContent, parseId, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { deleteDraftRequest, getOwnDraft, patchDraftRequest } from "@/controllers/requestsController";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getOwnDraft(supabase, session, requestId));
});

// Kun kladder kan redigeres. freeText kræver konto (architecture 10.4).
export const PATCH = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const input = await readJson(req, patchRequestSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await patchDraftRequest(supabase, session, requestId, input));
});

// Sletter kladden, inkl. billedfiler i storage. Rækker slettes via cascade.
export const DELETE = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  await deleteDraftRequest(supabase, session, requestId);
  return noContent();
});
