import { patchPortfolioItemSchema } from "@/lib/schemas/clinics";
import { jsonResponse, noContent, parseId, readJson, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { PortfolioController } from "@/controllers/portfolioController";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi<Ctx>(async (req, { params }) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const itemId = parseId((await params).id);
  const input = await readJson(req, patchPortfolioItemSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new PortfolioController(supabase, session).patch(itemId, input));
});

// Sletter rækken og filen.
export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  await requireTerms();
  const session = await requireRole("clinic");
  const itemId = parseId((await params).id);
  const supabase = await createSupabaseServerClient();
  await new PortfolioController(supabase, session).delete(itemId);
  return noContent();
});
