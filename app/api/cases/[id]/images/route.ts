import { CaseImagesController } from "@/controllers/caseImagesController";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/common/constants/limits";
import { imageFileReader, jsonResponse, parseId, rejectLargeImage, withApi } from "@/platform/middleware/http";
import { enforceIpRateLimit } from "@/platform/middleware/rateLimit";
import { requireRole } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";

type Ctx = { params: Promise<{ id: string }> };

// Billedupload (architecture 9.3). Filen læses først i controlleren, efter ejer-, kladde-, samtykke- og antalstjek.
export const POST = withApi<Ctx>(async (req, { params }) => {
  const gate = await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true, ctx: gate });
  await enforceIpRateLimit("patient-image-upload", req);
  const caseId = parseId((await params).id);
  rejectLargeImage(req, MAX_IMAGE_UPLOAD_BYTES);
  const readFile = imageFileReader(req, "file", MAX_IMAGE_UPLOAD_BYTES);
  return jsonResponse(await new CaseImagesController(gate.supabase, session).upload(caseId, readFile), 201);
});
