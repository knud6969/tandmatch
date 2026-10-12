import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, withApi } from "@/middleware/http";
import { ExportController } from "@/controllers/exportController";

// Dataeksport for egen konto (GDPR). Også for anonyme, så en patient kan se sin kladde før kontooprettelse.
export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new ExportController(supabase, session).exportOwnData());
});
