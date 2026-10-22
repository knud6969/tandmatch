import { createDentistSchema } from "@/lib/schemas/clinics";
import { jsonResponse, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicDentistsController } from "@/controllers/clinicDentistsController";

export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { supabase } = gate;
  return jsonResponse({ dentists: await new ClinicDentistsController(supabase, session).list() });
});

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const input = await readJson(req, createDentistSchema);
  const { supabase } = gate;
  return jsonResponse(await new ClinicDentistsController(supabase, session).create(input), 201);
});
