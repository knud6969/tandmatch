import { AdminClinicsController } from "@/features/admin/adminClinicsController";
import { adminClinicStatusSchema } from "@/lib/admin/schemas/admin";
import { jsonResponse, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// "Verificér" eller "Sæt på pause" (admin 10.14). 404; 409 INVALID_STATUS_TRANSITION.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole(["admin"], { ctx: gate });
  const clinicId = parseId((await params).id);
  const input = await readJson(req, adminClinicStatusSchema);
  return jsonResponse(await new AdminClinicsController(gate.supabase, session).changeStatus(clinicId, input));
});
