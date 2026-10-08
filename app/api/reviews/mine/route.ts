import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, withApi } from "@/middleware/http";
import { ownReviews } from "@/controllers/reviewsController";

// Patientens egne anmeldelser med moderationsstatus (architecture 10.9). Kun ejeren.
export const GET = withApi(async () => {
  await requireTerms();
  await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ reviews: await ownReviews(supabase) });
});
