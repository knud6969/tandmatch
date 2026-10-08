import { createRequestSchema } from "@/lib/schemas/requests";
import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { createDraftRequest, listOwnRequestsDto } from "@/controllers/requestsController";

// Egne forespørgsler (kun permanente patienter). Anonyme får deres kladde via /api/session/anonymous.
export const GET = withApi(async () => {
  await requireTerms();
  await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ requests: await listOwnRequestsDto(supabase) });
});

export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient");
  const input = await readJson(req, createRequestSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await createDraftRequest(supabase, session.userId, input.category), 201);
});
