import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { grantConsentSchema } from "@/lib/schemas/consents";
import { requireTerms } from "@/server/auth/terms";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, readJson, withApi } from "@/server/http/api";
import { insertConsent, listConsents } from "@/server/models/consents";

// Samtykker (GDPR art. 9). Vilkårs-accept er IKKE et samtykke (architecture 2.5, 10.3).
export const GET = withApi(async () => {
  await requireTerms();
  await requireRole("patient", { allowAnonymous: true });
  const supabase = await createSupabaseServerClient();
  return jsonResponse({ consents: await listConsents(supabase) });
});

export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireRole("patient", { allowAnonymous: true });
  const input = await readJson(req, grantConsentSchema);

  if (input.textVersion !== CONSENT_TEXT_VERSIONS[input.type]) {
    throw new ApiError(400, "CONSENT_VERSION_MISMATCH", "Samtykketeksten er opdateret. Læs den igen og accepter.");
  }
  if (input.type === "health_data_sharing" && session.isAnonymous) {
    throw new ApiError(403, "ACCOUNT_REQUIRED", "Opret en konto for at give samtykke til deling med tandlæger.");
  }

  const supabase = await createSupabaseServerClient();
  const consent = await insertConsent(supabase, {
    patientId: session.userId,
    type: input.type,
    textVersion: input.textVersion,
    grantedWhileAnonymous: session.isAnonymous,
  });
  return jsonResponse({ id: consent.id, type: consent.type, grantedAt: consent.grantedAt }, 201);
});
