import { requireTerms } from "@/platform/middleware/termsGate";
import { requireSession } from "@/platform/middleware/session";
import { jsonResponse, withApi } from "@/platform/middleware/http";
import { MeController } from "@/controllers/meController";

export const GET = withApi(async () => {
  const gate = await requireTerms();
  const session = await requireSession(gate);
  const { supabase } = gate;
  return jsonResponse(await new MeController(supabase, session).get());
});
