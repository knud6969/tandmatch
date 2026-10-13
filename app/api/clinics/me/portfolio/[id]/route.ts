import { patchPortfolioItemSchema } from "@/lib/schemas/clinics";
import { jsonResponse, noContent, parseId, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { PortfolioController } from "@/controllers/portfolioController";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const itemId = parseId((await params).id);
  const input = await readJson(req, patchPortfolioItemSchema);
  const { supabase } = gate;
  return jsonResponse(await new PortfolioController(supabase, session).patch(itemId, input));
});

// Sletter rækken og filen.
export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const itemId = parseId((await params).id);
  const { supabase } = gate;
  await new PortfolioController(supabase, session).delete(itemId);
  return noContent();
});
