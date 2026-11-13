import { updateTimeBlockSchema } from "@/lib/clinics/schemas/clinics";
import { jsonResponse, noContent, parseId, readJson, withApi } from "@/platform/middleware/http";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicsController } from "@/features/clinics/clinicsController";

type Ctx = { params: Promise<{ id: string }> };

// Ændrer en blokering (hele blokeringen sendes). Andres blokeringer giver 404.
export const PATCH = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const blockId = parseId((await params).id);
  const input = await readJson(req, updateTimeBlockSchema);
  return jsonResponse(await new ClinicsController(gate.supabase, session).updateTimeBlock(blockId, input));
});

export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const blockId = parseId((await params).id);
  const { supabase } = gate;
  await new ClinicsController(supabase, session).deleteTimeBlock(blockId);
  return noContent();
});
