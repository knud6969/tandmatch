import { availabilityQuerySchema } from "@/lib/schemas/clinics";
import { jsonResponse, parseId, readQuery, withApi } from "@/platform/middleware/http";
import { getSession } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicDirectoryController } from "@/controllers/clinicDirectoryController";

type Ctx = { params: Promise<{ id: string }> };

// Ledige tider for en behandling hos en verificeret klinik (architecture 6.7, 10.7). Højst 14 dage pr. kald.
export const GET = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const clinicId = parseId((await params).id);
  const query = readQuery(req, availabilityQuerySchema, ["serviceId", "from", "to"]);
  const session = await getSession(gate);
  return jsonResponse(await new ClinicDirectoryController(gate.supabase, session).availabilityFor(clinicId, query));
});
