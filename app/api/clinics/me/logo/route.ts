import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/constants/limits";
import { imageFileReader, jsonResponse, noContent, rejectLargeImage, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { ClinicsController } from "@/controllers/clinicsController";

// Logo i den offentlige bucket (architecture 9.5, 10.8). Filen læses først efter ejertjekket.
export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("clinic");
  rejectLargeImage(req, MAX_IMAGE_UPLOAD_BYTES);
  const readFile = imageFileReader(req, "file", MAX_IMAGE_UPLOAD_BYTES);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new ClinicsController(supabase, session).uploadLogo(readFile));
});

export const DELETE = withApi(async () => {
  await requireTerms();
  const session = await requireRole("clinic");
  const supabase = await createSupabaseServerClient();
  await new ClinicsController(supabase, session).deleteLogo();
  return noContent();
});
