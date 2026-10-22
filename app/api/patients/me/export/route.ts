import { requireTerms } from "@/platform/middleware/termsGate";
import { requireRole } from "@/platform/middleware/session";
import { jsonResponse, withApi } from "@/platform/middleware/http";
import { ExportController } from "@/controllers/exportController";

// Dataeksport for egen konto (GDPR). Også for anonyme, så en patient kan se sin kladde før kontooprettelse.
export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const { supabase } = gate;
  return jsonResponse(await new ExportController(supabase, session).exportOwnData());
});
