import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/constants/limits";
import { createPortfolioItemSchema } from "@/lib/schemas/clinics";
import { jsonResponse, readImageForm, rejectLargeImage, withApi } from "@/middleware/http";
import { requireRole } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { PortfolioController } from "@/controllers/portfolioController";

// Porteføljebillede (architecture 9.5, 10.8). Uden afkrydset samtykkebekræftelse giver felt-valideringen 400, før
// billedet behandles.
export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("clinic");
  rejectLargeImage(req, MAX_IMAGE_UPLOAD_BYTES);
  const { file, fields } = await readImageForm(req, "file", MAX_IMAGE_UPLOAD_BYTES, createPortfolioItemSchema);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await new PortfolioController(supabase, session).create(fields, file), 201);
});
