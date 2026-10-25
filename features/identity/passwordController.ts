import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { RECOVERY_REQUIRED_TEXT } from "@/lib/common/constants/error-texts";
import { PASSWORD_RECOVERY_WINDOW_MINUTES } from "@/lib/identity/constants/sessions";
import type { forgotPasswordSchema, passwordRecoverySchema, resetPasswordSchema } from "@/lib/identity/schemas/auth";
import { ApiError } from "@/platform/middleware/http";
import { AuthRepository, type AuthMethod } from "@/features/identity/authRepository";

type ForgotInput = z.infer<typeof forgotPasswordSchema>;
type RecoveryInput = z.infer<typeof passwordRecoverySchema>;
type ResetInput = z.infer<typeof resetPasswordSchema>;

// Metoder i amr, som kun et link fra e-mailen giver (vi har ingen OTP- eller magic link-login).
const RECOVERY_METHODS = new Set(["otp", "recovery"]);

// Sand, når sessionen er oprettet fra et nulstillingslink inden for vinduet (architecture 10.2). amr-tidsstempler er sekunder.
export function hasRecentRecovery(methods: readonly AuthMethod[], now: Date = new Date()): boolean {
  const earliest = now.getTime() / 1000 - PASSWORD_RECOVERY_WINDOW_MINUTES * 60;
  return methods.some((m) => RECOVERY_METHODS.has(m.method) && m.timestamp >= earliest);
}

export type PasswordDeps = { auth: AuthRepository };

// Glemt adgangskode (architecture 10.2): link pr. e-mail, recovery-session og ny adgangskode. Undtaget fra vilkårs-gaten;
// kun weben (routen afviser appen). Tokens og koder logges aldrig.
export class PasswordController {
  private readonly auth: AuthRepository;

  constructor(supabase: SupabaseClient, deps: Partial<PasswordDeps> = {}) {
    this.auth = deps.auth ?? new AuthRepository(supabase);
  }

  // Svarer altid ens (routen giver 202), uanset om e-mailen findes, eller om Supabase afviser: ingen konto-opregning.
  async forgot(input: ForgotInput, redirectTo: string): Promise<void> {
    const sent = await this.auth.requestPasswordReset(input.email, redirectTo);
    if (!sent) {
      // Uden e-mail, kode eller fejlbesked fra Supabase (kan indeholde persondata).
      console.error("auth: nulstillingslink blev ikke sendt");
    }
  }

  async recover(input: RecoveryInput): Promise<void> {
    await this.auth.startRecoverySession(input);
  }

  // Kun en frisk recovery-session må sætte en adgangskode uden den nuværende. Bagefter logges alle sessioner ud.
  async reset(input: ResetInput, now: Date = new Date()): Promise<void> {
    if (!hasRecentRecovery(await this.auth.authMethods(), now)) {
      throw new ApiError(403, "RECOVERY_REQUIRED", RECOVERY_REQUIRED_TEXT);
    }
    await this.auth.updatePassword(input.password);
    await this.auth.signOut("global");
  }
}
