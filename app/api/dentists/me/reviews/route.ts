import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, withApi } from "@/middleware/http";
import { dentistOwnReviews } from "@/controllers/reviewsController";

// Tandlægens egne anmeldelser, inkl. pending, og status på eget svar (architecture 10.9). Kun tandlægen selv.
export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("dentist");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ reviews: await dentistOwnReviews(supabase, session.userId) });
});
