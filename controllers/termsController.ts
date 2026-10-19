import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";
import type { termsAcceptSchema } from "@/lib/schemas/terms";
import type { TermsStatusDto } from "@/lib/types/auth";
import { ApiError } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import type { TermsPayload } from "@/middleware/termsCookie";
import { AuthRepository } from "@/models/authRepository";
import { TermsRepository } from "@/models/termsRepository";

type TermsAcceptInput = z.infer<typeof termsAcceptSchema>;

// Undtaget fra vilkårs-gaten. Vilkårs-accept giver IKKE samtykke (architecture 2.5).
export type TermsDeps = { auth: AuthRepository; terms: TermsRepository };

export class TermsController {
  private readonly auth: AuthRepository;
  private readonly terms: TermsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session | null,
    deps: Partial<TermsDeps> = {},
  ) {
    this.auth = deps.auth ?? new AuthRepository(supabase);
    this.terms = deps.terms ?? new TermsRepository(supabase);
  }

  // Accepten gælder kun, hvis versionerne er de aktuelle. Er der en session, skrives også en række i
  // terms_acceptances (med bearer verificeres tokenet; et ugyldigt token giver ingen række). Returnerer den accept, routen
  // gemmer i den signerede cookie eller udleverer som termsToken til appen.
  async accept(input: TermsAcceptInput, accessToken?: string): Promise<TermsPayload> {
    if (input.termsVersion !== TERMS_VERSION || input.privacyVersion !== PRIVACY_VERSION) {
      throw new ApiError(400, "OUTDATED_TERMS", "Vilkårene er opdateret. Læs de nye vilkår og accepter igen.");
    }

    const payload = {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      acceptedAt: new Date().toISOString(),
    };

    const userId = await this.auth.findUserId(accessToken);
    if (userId) {
      await this.terms.upsertAcceptance(userId, payload);
    }
    return payload;
  }

  // Svarer kun om den aktuelle accept findes (gyldig cookie eller række for sessionen).
  async status(hasValidCookie: boolean): Promise<TermsStatusDto> {
    const accepted =
      hasValidCookie || (this.session !== null && (await this.terms.hasCurrentAcceptance(this.session.userId)));
    return {
      current: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
      accepted,
    };
  }
}
