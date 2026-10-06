import { patchDentistSchema } from "@/lib/schemas/dentists";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, readJson, withApi } from "@/server/http/api";
import { getMyDentist, updateMyDentist } from "@/server/services/dentists";

// Egen tandlægeprofil (architecture 10.8). Ikke-verificerede tandlæger kan se og redigere profilen, men ikke svare.
export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("dentist");
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await getMyDentist(supabase, session.userId));
});

export const PATCH = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const input = await readJson(req, patchDentistSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await updateMyDentist(supabase, session.userId, input));
});
