import { CaseImagesController } from "@/controllers/caseImagesController";
import { noContent, parseId, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string; imageId: string }> };

export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  const { id, imageId } = await params;
  await new CaseImagesController(gate.supabase, session).delete(parseId(id), parseId(imageId));
  return noContent();
});
