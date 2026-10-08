import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/constants/limits";
import { imageFileReader, jsonResponse, parseId, rejectLargeImage, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { uploadRequestImage } from "@/controllers/imagesController";

type Ctx = { params: Promise<{ id: string }> };

// Upload kræver et aktivt image_upload-samtykke, givet lige før upload (architecture 9.3, 9.4).
// Vilkårs-accept giver ingen ret til upload.
export const POST = withApi(async (req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const requestId = parseId((await ctx.params).id);
  await enforceIpRateLimit("image-upload", req);
  rejectLargeImage(req, MAX_IMAGE_UPLOAD_BYTES);
  const readFile = imageFileReader(req, "file", MAX_IMAGE_UPLOAD_BYTES);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await uploadRequestImage(supabase, session, requestId, readFile), 201);
});
