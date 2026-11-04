import { AdminClinicsController } from "@/features/admin/adminClinicsController";
import { adminClinicsQuerySchema } from "@/lib/admin/schemas/admin";
import { jsonResponse, readQuery, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Admins klinikliste med filter på status og søgning (admin 10.14). Kun admin.
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole(["admin"], { ctx: gate });
  const query = readQuery(req, adminClinicsQuerySchema, ["status", "q"]);
  return jsonResponse(await new AdminClinicsController(gate.supabase, session).list(query));
});
