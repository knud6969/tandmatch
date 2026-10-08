import { dentistListQuerySchema } from "@/lib/schemas/standard";
import { jsonResponse, readQuery, withApi } from "@/middleware/http";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { listStandardDentists } from "@/controllers/standardTrackController";

// Offentlig liste for standard-sporet (architecture 10.8). Ingen login krævet, kun vilkårs-accept.
export const GET = withApi(async (req) => {
  await requireTerms();
  const query = readQuery(req, dentistListQuerySchema, ["postalCode", "service"]);
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ dentists: await listStandardDentists(supabase, query.postalCode, query.service) });
});
