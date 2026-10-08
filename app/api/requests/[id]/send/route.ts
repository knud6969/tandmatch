import { requireTerms } from "@/middleware/termsGate";
import { requireAccount, requireRole } from "@/middleware/session";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { jsonResponse, parseId, withApi } from "@/middleware/http";
import { sendDraftRequest } from "@/controllers/requestsController";

type Ctx = { params: Promise<{ id: string }> };

// Afsendelse kræver permanent konto (architecture 6.2, 10.4). Selve reglerne ligger i send_request().
export const POST = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = requireAccount(
    await requireRole("patient", { allowAnonymous: true }),
    "Opret en konto for at sende forespørgslen.",
  );
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  return jsonResponse(await sendDraftRequest(supabase, session, requestId));
});
