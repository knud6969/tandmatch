import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";
import { termsAcceptSchema } from "@/lib/schemas/terms";
import type { TermsAcceptedDto } from "@/lib/types/auth";
import { setTermsCookie } from "@/server/auth/terms";
import { upsertTermsAcceptance } from "@/server/models/terms";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, readJson, withApi } from "@/server/http/api";

// Undtaget fra vilkårs-gaten. Accepten gælder kun, hvis versionerne er de aktuelle.
// Er der en session, skrives også en række i terms_acceptances. Vilkårs-accept giver IKKE samtykke.
export const POST = withApi(async (req) => {
  const input = await readJson(req, termsAcceptSchema);

  if (input.termsVersion !== TERMS_VERSION || input.privacyVersion !== PRIVACY_VERSION) {
    throw new ApiError(
      400,
      "OUTDATED_TERMS",
      "Vilkårene er opdateret. Læs de nye vilkår og accepter igen.",
    );
  }

  const payload = {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt: new Date().toISOString(),
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await upsertTermsAcceptance(supabase, user.id, payload);
  }

  await setTermsCookie(payload);

  const body: TermsAcceptedDto = { acceptedAt: payload.acceptedAt };
  return jsonResponse(body, 200);
});
