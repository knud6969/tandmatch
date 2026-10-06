import { inboxQuerySchema } from "@/lib/schemas/dentists";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, withApi } from "@/server/http/api";
import { listInbox } from "@/server/services/inbox";

// Tandlægens indbakke: forespørgsler sendt til tandlægen (architecture 10.6). Kun verificerede tandlæger.
export const GET = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const url = new URL(req.url);
  const query = inboxQuerySchema.safeParse({ status: url.searchParams.get("status") ?? undefined });
  if (!query.success) {
    throw new ApiError(400, "VALIDATION_ERROR", query.error.issues[0]?.message ?? "Ugyldig forespørgsel.");
  }
  const supabase = await createSupabaseServerClient();
  const items = await listInbox(supabase, session.userId, query.data.status);
  return jsonResponse({ items });
});
