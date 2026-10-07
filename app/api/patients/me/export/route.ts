import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, withApi } from "@/server/http/api";
import { exportOwnData } from "@/server/services/export";

// Dataeksport for egen konto (GDPR). Også for anonyme, så en patient kan se sin kladde før kontooprettelse.
export const GET = withApi(async () => {
  await requireTerms();
  await requireRole("patient", { allowAnonymous: true });
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await exportOwnData(supabase));
});
