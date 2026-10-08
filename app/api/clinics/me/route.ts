import { patchClinicSchema } from "@/lib/schemas/dentists";
import { requireTerms } from "@/middleware/termsGate";
import { requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { updateMyClinic } from "@/controllers/dentistsController";

// Tandlægens egen klinik. Første kald opretter klinikken (created_by = tandlægen).
export const PATCH = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("dentist");
  const input = await readJson(req, patchClinicSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await updateMyClinic(supabase, session.userId, input));
});
