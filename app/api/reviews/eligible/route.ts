import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, withApi } from "@/server/http/api";
import { eligibleVisits } from "@/server/services/reviews";

// Patientens verificerede besøg uden anmeldelse (architecture 10.9).
export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ items: await eligibleVisits(supabase, session.userId) });
});
