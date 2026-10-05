import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";
import type { TermsStatusDto } from "@/lib/types/auth";
import { readCurrentTermsCookie } from "@/server/auth/terms";
import { getSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { hasCurrentTermsAcceptance } from "@/server/models/terms";
import { jsonResponse, withApi } from "@/server/http/api";

// Undtaget fra vilkårs-gaten. Svarer kun om den aktuelle accept findes.
export const GET = withApi(async () => {
  let accepted = (await readCurrentTermsCookie()) !== null;

  if (!accepted) {
    const session = await getSession();
    if (session) {
      const supabase = await createSupabaseServerClient();
      accepted = await hasCurrentTermsAcceptance(supabase, session.userId);
    }
  }

  const body: TermsStatusDto = {
    current: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    accepted,
  };
  return jsonResponse(body);
});
