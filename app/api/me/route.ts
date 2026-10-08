import { requireTerms } from "@/middleware/termsGate";
import { requireSession } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, withApi } from "@/middleware/http";
import { getMe } from "@/controllers/meController";

export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getMe(supabase, session));
});
