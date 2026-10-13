import { patchDentistSchema } from "@/lib/schemas/clinics";
import { jsonResponse, noContent, parseId, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { ClinicDentistsController } from "@/controllers/clinicDentistsController";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi<Ctx>(async (req, { params }) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const dentistId = parseId((await params).id);
  const input = await readJson(req, patchDentistSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new ClinicDentistsController(supabase, session).patch(dentistId, input));
});

// Sletter tandlægen, portrættet og porteføljen.
export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const dentistId = parseId((await params).id);
  const supabase = await createSupabaseServerClient();
  await new ClinicDentistsController(supabase, session).delete(dentistId);
  return noContent();
});
