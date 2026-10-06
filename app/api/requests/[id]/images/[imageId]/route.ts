import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, notFound, parseId, withApi } from "@/server/http/api";
import { createSupabaseAdminClient } from "@/server/db/admin";
import { requireOwnRequest } from "@/server/models/requests";
import { deleteImageRow, getImage } from "@/server/models/images";
import { removeImageObject } from "@/server/services/images";

type Ctx = { params: Promise<{ id: string; imageId: string }> };

export const DELETE = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const params = await ctx.params;
  const requestId = parseId(params.id);
  const imageId = parseId(params.imageId);
  const supabase = await createSupabaseServerClient();
  const record = await requireOwnRequest(supabase, requestId, session.userId);
  if (record.status !== "draft") {
    throw new ApiError(409, "NOT_DRAFT", "Forespørgslen er sendt og kan ikke ændres.");
  }
  const image = await getImage(supabase, requestId, imageId);
  if (!image) throw notFound();
  const admin = createSupabaseAdminClient();
  await removeImageObject(admin, image.storagePath);
  await deleteImageRow(admin, imageId);
  return new Response(null, { status: 204 });
});
