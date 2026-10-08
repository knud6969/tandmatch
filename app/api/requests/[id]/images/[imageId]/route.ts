import { noContent, parseId, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { deleteRequestImage } from "@/controllers/imagesController";

type Ctx = { params: Promise<{ id: string; imageId: string }> };

export const DELETE = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const params = await ctx.params;
  const requestId = parseId(params.id);
  const imageId = parseId(params.imageId);
  const supabase = await createSupabaseServerClient();
  await deleteRequestImage(supabase, session, requestId, imageId);
  return noContent();
});
