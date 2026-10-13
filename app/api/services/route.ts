import { servicesQuerySchema } from "@/lib/schemas/services";
import { jsonResponse, readQuery, withApi } from "@/middleware/http";
import { getSession } from "@/middleware/session";
import { requireTerms } from "@/middleware/termsGate";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { ServicesController } from "@/controllers/servicesController";

// Ydelseskataloget er offentligt (architecture 10.4).
export const GET = withApi(async (req) => {
  await requireTerms();
  const query = readQuery(req, servicesQuerySchema, ["category"]);
  const session = await getSession();
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ services: await new ServicesController(supabase, session).list(query) });
});
