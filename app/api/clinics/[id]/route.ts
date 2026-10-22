import { clinicProfileQuerySchema } from "@/lib/clinics/schemas/clinics";
import { jsonResponse, parseId, readQuery, withApi } from "@/platform/middleware/http";
import { getSession } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicDirectoryController } from "@/features/clinics/clinicDirectoryController";

type Ctx = { params: Promise<{ id: string }> };

// Offentlig klinikprofil (architecture 10.7). 404 for ukendte, registrerede og slettede klinikker.
export const GET = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const clinicId = parseId((await params).id);
  const query = readQuery(req, clinicProfileQuerySchema, ["services"]);
  const session = await getSession(gate);
  return jsonResponse(await new ClinicDirectoryController(gate.supabase, session).get(clinicId, query));
});
