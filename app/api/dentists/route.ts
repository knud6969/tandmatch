import { dentistListQuerySchema } from "@/lib/schemas/standard";
import { requireTerms } from "@/server/auth/terms";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, withApi } from "@/server/http/api";
import { listStandardDentists } from "@/server/services/standard-track";

// Offentlig liste for standard-sporet (architecture 10.8). Ingen login krævet, kun vilkårs-accept.
export const GET = withApi(async (req) => {
  await requireTerms();
  const url = new URL(req.url);
  const query = dentistListQuerySchema.safeParse({
    postalCode: url.searchParams.get("postalCode") ?? undefined,
    service: url.searchParams.get("service") ?? undefined,
  });
  if (!query.success) {
    throw new ApiError(400, "VALIDATION_ERROR", query.error.issues[0]?.message ?? "Ugyldig forespørgsel.");
  }
  const supabase = await createSupabaseServerClient();
  const dentists = await listStandardDentists(supabase, query.data.postalCode, query.data.service);
  return jsonResponse({ dentists });
});
