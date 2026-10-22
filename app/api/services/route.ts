import { servicesQuerySchema } from "@/lib/schemas/services";
import { jsonResponse, readQuery, withApi } from "@/platform/middleware/http";
import { getSession } from "@/platform/middleware/session";
import { requireTerms } from "@/platform/middleware/termsGate";
import { ServicesController } from "@/controllers/servicesController";

// Ydelseskataloget er offentligt (architecture 10.4).
export const GET = withApi(async (req) => {
  const gate = await requireTerms();
  const query = readQuery(req, servicesQuerySchema, ["category"]);
  const session = await getSession(gate);
  const { supabase } = gate;
  return jsonResponse({ groups: await new ServicesController(supabase, session).list(query) });
});
