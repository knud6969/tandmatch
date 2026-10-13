import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/constants/limits";
import { createPortfolioItemSchema } from "@/lib/schemas/clinics";
import { jsonResponse, readImageForm, rejectLargeImage, withApi } from "@/middleware/http";
import { enforceIpRateLimit } from "@/middleware/rateLimit";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { PortfolioController } from "@/controllers/portfolioController";

// Porteføljebillede (architecture 9.5, 10.8). Uden afkrydset samtykkebekræftelse giver felt-valideringen 400, før
// billedet behandles.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const session = await requireRole("clinic", { ctx: gate });
  await enforceIpRateLimit("clinic-image-upload", req);
  rejectLargeImage(req, MAX_IMAGE_UPLOAD_BYTES);
  const { file, fields } = await readImageForm(req, "file", MAX_IMAGE_UPLOAD_BYTES, createPortfolioItemSchema);
  const { supabase } = gate;
  return jsonResponse(await new PortfolioController(supabase, session).create(fields, file), 201);
});
