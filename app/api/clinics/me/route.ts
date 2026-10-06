import { patchClinicSchema } from "@/lib/schemas/dentists";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { jsonResponse, readJson, withApi } from "@/server/http/api";
import { updateMyClinic } from "@/server/services/dentists";

// Tandlægens egen klinik. Første kald opretter klinikken (created_by = tandlægen).
export const PATCH = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const input = await readJson(req, patchClinicSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await updateMyClinic(supabase, session.userId, input));
});
