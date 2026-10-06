import { createRequestSchema } from "@/lib/schemas/requests";
import { QUESTIONS_VERSION } from "@/lib/constants/questions";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, readJson, withApi } from "@/server/http/api";
import { getRequest, insertDraft, listOwnRequests } from "@/server/models/requests";
import { buildDraftDto } from "@/server/services/requests";
import { countSentResponses } from "@/server/models/responses";

// Egne forespørgsler (kun permanente patienter). Anonyme får deres kladde via /api/session/anonymous.
export const GET = withApi(async () => {
  await requireTerms();
  await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  const records = await listOwnRequests(supabase);
  const counts = await countSentResponses(
    supabase,
    records.map((r) => r.id),
  );
  return jsonResponse({
    requests: records.map((r) => ({
      id: r.id,
      category: r.category,
      status: r.status,
      sentAt: r.sentAt,
      expiresAt: r.expiresAt,
      responseCount: counts.get(r.id) ?? 0,
      unreadMessages: 0, // beskeder kommer i trin 6
    })),
  });
});

export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient");
  const input = await readJson(req, createRequestSchema);
  const supabase = await createSupabaseServerClient();
  const id = await insertDraft(supabase, {
    patientId: session.userId,
    category: input.category,
    questionsVersion: QUESTIONS_VERSION,
  });
  const record = await getRequest(supabase, id);
  if (!record) {
    throw new Error("forespørgsel ikke fundet efter oprettelse");
  }
  return jsonResponse(await buildDraftDto(supabase, record), 201);
});
