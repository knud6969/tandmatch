import { jsonResponse, parseId, withApi } from "@/platform/middleware/http";
import { getSession } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicDirectoryController } from "@/controllers/clinicDirectoryController";

type Ctx = { params: Promise<{ id: string }> };

// Godkendte anmeldelser og prisnøjagtighed (architecture 10.7, 8). 404 for ikke-verificerede klinikker.
export const GET = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const clinicId = parseId((await params).id);
  const session = await getSession(gate);
  return jsonResponse(await new ClinicDirectoryController(gate.supabase, session).reviews(clinicId));
});
