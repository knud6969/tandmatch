import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, withApi } from "@/server/http/api";
import { dentistOwnReviews } from "@/server/services/reviews";

// Tandlægens egne anmeldelser, inkl. pending, og status på eget svar (architecture 10.9). Kun tandlægen selv.
export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("dentist");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ reviews: await dentistOwnReviews(supabase, session.userId) });
});
