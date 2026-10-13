import { noContent, parseId, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { ClinicsController } from "@/controllers/clinicsController";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const blockId = parseId((await params).id);
  const supabase = await createSupabaseServerClient();
  await new ClinicsController(supabase, session).deleteTimeBlock(blockId);
  return noContent();
});
