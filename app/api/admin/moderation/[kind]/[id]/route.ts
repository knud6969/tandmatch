import { AdminModerationController } from "@/features/admin/adminModerationController";
import { adminModerateSchema, adminModerationKindSchema } from "@/lib/admin/schemas/admin";
import { jsonResponse, notFound, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ kind: string; id: string }> };

// Godkend eller afvis en anmeldelse (kind=review) eller et svar (kind=reply) (admin 10.14). 404; 400 REASON_REQUIRED uden begrundelse ved afvisning.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole(["admin"], { ctx: gate });
  const { kind: rawKind, id: rawId } = await params;
  const kind = adminModerationKindSchema.safeParse(rawKind);
  if (!kind.success) throw notFound();
  const input = await readJson(req, adminModerateSchema);
  return jsonResponse(await new AdminModerationController(gate.supabase, session).moderate(kind.data, parseId(rawId), input));
});
