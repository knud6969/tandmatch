import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/constants/limits";
import { imageFileReader, jsonResponse, noContent, parseId, rejectLargeImage, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { ClinicDentistsController } from "@/controllers/clinicDentistsController";

type Ctx = { params: Promise<{ id: string }> };

// Portræt i den offentlige bucket (architecture 9.5). Filen læses først efter ejertjekket.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const dentistId = parseId((await params).id);
  await enforceIpRateLimit("clinic-image-upload", req);
  rejectLargeImage(req, MAX_IMAGE_UPLOAD_BYTES);
  const readFile = imageFileReader(req, "file", MAX_IMAGE_UPLOAD_BYTES);
  const { supabase } = gate;
  return jsonResponse(await new ClinicDentistsController(supabase, session).uploadPhoto(dentistId, readFile));
});

export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  const dentistId = parseId((await params).id);
  const { supabase } = gate;
  await new ClinicDentistsController(supabase, session).deletePhoto(dentistId);
  return noContent();
});
