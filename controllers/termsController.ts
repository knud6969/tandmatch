import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";
import type { termsAcceptSchema } from "@/lib/schemas/terms";
import type { TermsStatusDto } from "@/lib/types/auth";
import type { Session } from "@/middleware/session";
import type { TermsPayload } from "@/middleware/termsCookie";
import { ApiError } from "@/middleware/http";
import { getAuthUserId } from "@/models/authModel";
import { upsertTermsAcceptance, hasCurrentTermsAcceptance } from "@/models/termsModel";

type TermsAcceptInput = z.infer<typeof termsAcceptSchema>;

// Undtaget fra vilkårs-gaten. Accepten gælder kun, hvis versionerne er de aktuelle.
// Er der en session, skrives også en række i terms_acceptances. Vilkårs-accept giver IKKE samtykke.
// Returnerer den accept, routen gemmer i den signerede cookie.
export async function acceptTerms(supabase: SupabaseClient, input: TermsAcceptInput): Promise<TermsPayload> {
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

  const userId = await getAuthUserId(supabase);
  if (userId) {
    await upsertTermsAcceptance(supabase, userId, payload);
  }

  return payload;
}

// Undtaget fra vilkårs-gaten. Svarer kun om den aktuelle accept findes (gyldig cookie eller række for sessionen).
export async function getTermsStatus(
  supabase: SupabaseClient,
  hasValidCookie: boolean,
  session: Session | null,
): Promise<TermsStatusDto> {
  const accepted =
    hasValidCookie || (session !== null && (await hasCurrentTermsAcceptance(supabase, session.userId)));

  return {
    current: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    accepted,
  };
}
