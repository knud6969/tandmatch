import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { INVALID_CURRENT_PASSWORD_TEXT, SAME_EMAIL_TEXT, SAME_PASSWORD_TEXT } from "@/lib/common/constants/error-texts";
import type { changeEmailSchema, changePasswordSchema } from "@/lib/identity/schemas/auth";
import type { AccountDto } from "@/lib/identity/types/auth";
import { createSupabaseStatelessClient } from "@/platform/db/supabase";
import { ApiError, unauthenticated } from "@/platform/middleware/http";
import { AuthRepository } from "@/features/identity/authRepository";

type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// `verifier` giver et AuthRepository over en ny klient uden cookies, så tjekket af den nuværende adgangskode aldrig
// rører brugerens egen session.
export type AccountDeps = { auth: AuthRepository; verifier: () => AuthRepository };

// Klinikkens login: e-mail og adgangskode (architecture 10.2). Routen har sikret vilkår, rollen (klinik) og at det er weben.
export class AccountController {
  private readonly auth: AuthRepository;
  private readonly verifier: () => AuthRepository;

  constructor(supabase: SupabaseClient, deps: Partial<AccountDeps> = {}) {
    this.auth = deps.auth ?? new AuthRepository(supabase);
    this.verifier = deps.verifier ?? (() => new AuthRepository(createSupabaseStatelessClient()));
  }

  async get(): Promise<AccountDto> {
    return { email: await this.requireEmail() };
  }

  // Supabase sender bekræftelseslinks; e-mailen skifter først, når der er bekræftet. Findes adressen allerede, er svaret
  // det samme (ingen konto-opregning).
  async changeEmail(input: ChangeEmailInput, redirectTo: string): Promise<void> {
    const email = await this.requireEmail();
    if (input.email === email.toLowerCase()) {
      throw new ApiError(400, "SAME_EMAIL", SAME_EMAIL_TEXT);
    }
    await this.requireCurrentPassword(email, input.currentPassword);
    await this.auth.requestEmailChange(input.email, redirectTo);
  }

  // Ny adgangskode; brugerens andre sessioner logges ud, denne fortsætter.
  async changePassword(input: ChangePasswordInput): Promise<void> {
    if (input.newPassword === input.currentPassword) {
      throw new ApiError(400, "SAME_PASSWORD", SAME_PASSWORD_TEXT);
    }
    const email = await this.requireEmail();
    await this.requireCurrentPassword(email, input.currentPassword);
    await this.auth.updatePassword(input.newPassword);
    await this.auth.signOut("others");
  }

  private async requireEmail(): Promise<string> {
    const email = await this.auth.currentEmail();
    if (!email) throw unauthenticated();
    return email;
  }

  // Logger ind med en separat klient og logger straks ud igen (den midlertidige session tilbagekaldes).
  private async requireCurrentPassword(email: string, password: string): Promise<void> {
    const verifier = this.verifier();
    try {
      await verifier.signInWithPassword(email, password);
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        throw new ApiError(400, "INVALID_CURRENT_PASSWORD", INVALID_CURRENT_PASSWORD_TEXT);
      }
      throw error;
    }
    await verifier.signOutLocal().catch(() => undefined);
  }
}
