import { noContent, parseId, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { ClinicsController } from "@/controllers/clinicsController";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const blockId = parseId((await params).id);
  const { supabase } = gate;
  await new ClinicsController(supabase, session).deleteTimeBlock(blockId);
  return noContent();
});
