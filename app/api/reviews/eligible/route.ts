import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, withApi } from "@/middleware/http";
import { eligibleVisits } from "@/controllers/reviewsController";

// Patientens verificerede besøg uden anmeldelse (architecture 10.9).
export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ items: await eligibleVisits(supabase, session.userId) });
});
