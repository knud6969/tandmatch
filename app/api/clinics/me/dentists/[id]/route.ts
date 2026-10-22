import { patchDentistSchema } from "@/lib/schemas/clinics";
import { jsonResponse, noContent, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicDentistsController } from "@/controllers/clinicDentistsController";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const dentistId = parseId((await params).id);
  const input = await readJson(req, patchDentistSchema);
  const { supabase } = gate;
  return jsonResponse(await new ClinicDentistsController(supabase, session).patch(dentistId, input));
});

// Sletter tandlægen, portrættet og porteføljen.
export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const dentistId = parseId((await params).id);
  const { supabase } = gate;
  await new ClinicDentistsController(supabase, session).delete(dentistId);
  return noContent();
});
