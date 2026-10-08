import { inboxQuerySchema } from "@/lib/schemas/dentists";
import { jsonResponse, readQuery, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { listInbox } from "@/controllers/inboxController";

// Tandlægens indbakke: forespørgsler sendt til tandlægen (architecture 10.6). Kun verificerede tandlæger.
export const GET = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const query = readQuery(req, inboxQuerySchema, ["status"]);
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ items: await listInbox(supabase, session.userId, query.status) });
});
