import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, parseId, withApi } from "@/server/http/api";
import { getRequest, requireOwnRequest, sendRequest } from "@/server/models/requests";

type Ctx = { params: Promise<{ id: string }> };

// Afsendelse kræver permanent konto (architecture 6.2, 10.4). Selve reglerne ligger i send_request().
export const POST = withApi(async (_req, ctx: Ctx) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  if (session.isAnonymous) {
    throw new ApiError(403, "ACCOUNT_REQUIRED", "Opret en konto for at sende forespørgslen.");
  }
  const requestId = parseId((await ctx.params).id);
  const supabase = await createSupabaseServerClient();
  await requireOwnRequest(supabase, requestId, session.userId);
  const recipientCount = await sendRequest(supabase, requestId);
  const sent = await getRequest(supabase, requestId);
  return jsonResponse({
    status: "sent",
    recipientCount,
    expiresAt: sent?.expiresAt ?? null,
  });
});
