import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, withApi } from "@/server/http/api";
import { ownReviews } from "@/server/services/reviews";

// Patientens egne anmeldelser med moderationsstatus (architecture 10.9). Kun ejeren.
export const GET = withApi(async () => {
  await requireTerms();
  await requireRole("patient");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ reviews: await ownReviews(supabase) });
});
