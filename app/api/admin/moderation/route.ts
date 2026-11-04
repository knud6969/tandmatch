import { AdminModerationController } from "@/features/admin/adminModerationController";
import { adminModerationQuerySchema } from "@/lib/admin/schemas/admin";
import { jsonResponse, readQuery, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

// Anmeldelser eller klinikkers svar til moderation, ældste først (admin 10.14). Kun admin.
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole(["admin"], { ctx: gate });
  const query = readQuery(req, adminModerationQuerySchema, ["kind", "status"]);
  return jsonResponse(await new AdminModerationController(gate.supabase, session).list(query));
});
