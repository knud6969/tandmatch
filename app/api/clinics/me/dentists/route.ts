import { createDentistSchema } from "@/lib/schemas/clinics";
import { jsonResponse, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { ClinicDentistsController } from "@/controllers/clinicDentistsController";

export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireRole("clinic");
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ dentists: await new ClinicDentistsController(supabase, session).list() });
});

export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const input = await readJson(req, createDentistSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new ClinicDentistsController(supabase, session).create(input), 201);
});
