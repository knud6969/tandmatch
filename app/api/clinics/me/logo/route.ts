import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/common/constants/limits";
import { imageFileReader, jsonResponse, noContent, rejectLargeImage, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ClinicsController } from "@/controllers/clinicsController";

// Logo i den offentlige bucket (architecture 9.5, 10.8). Filen læses først efter ejertjekket.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  await enforceIpRateLimit("clinic-image-upload", req);
  rejectLargeImage(req, MAX_IMAGE_UPLOAD_BYTES);
  const readFile = imageFileReader(req, "file", MAX_IMAGE_UPLOAD_BYTES);
  const { supabase } = gate;
  return jsonResponse(await new ClinicsController(supabase, session).uploadLogo(readFile));
});

export const DELETE = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const { supabase } = gate;
  await new ClinicsController(supabase, session).deleteLogo();
  return noContent();
});
