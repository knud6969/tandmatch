import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { convertSchema, loginSchema, signupSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";
import { ApiError, unauthenticated } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import type { TermsPayload } from "@/middleware/termsCookie";
import { AuthRepository } from "@/models/authRepository";
import { PatientsRepository } from "@/models/patientsRepository";
import { ClinicsRepository } from "@/models/clinicsRepository";
import { ProfilesRepository } from "@/models/profilesRepository";
import { TermsRepository } from "@/models/termsRepository";

type LoginInput = z.infer<typeof loginSchema>;
type SignupInput = z.infer<typeof signupSchema>;
type ConvertInput = z.infer<typeof convertSchema>;

// Login, logout, signup og konvertering. `session` er den aktuelle session eller null (ingen session).
export type AuthDeps = {
  auth: AuthRepository;
  profiles: ProfilesRepository;
  clinics: ClinicsRepository;
  patients: PatientsRepository;
  terms: TermsRepository;
};

export class AuthController {
  private readonly auth: AuthRepository;
  private readonly profiles: ProfilesRepository;
  private readonly clinics: ClinicsRepository;
  private readonly patients: PatientsRepository;
  private readonly terms: TermsRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session | null,
    deps: Partial<AuthDeps> = {},
  ) {
    this.auth = deps.auth ?? new AuthRepository(supabase);
    this.profiles = deps.profiles ?? new ProfilesRepository(supabase);
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
    this.patients = deps.patients ?? new PatientsRepository(supabase);
    this.terms = deps.terms ?? new TermsRepository(supabase);
  }

  async login(terms: TermsPayload | null, input: LoginInput): Promise<AuthUserDto> {
    const userId = await this.auth.signInWithPassword(input.email, input.password);

    if (terms) {
      await this.terms.upsertAcceptance(userId, terms);
    }

    const profile = await this.profiles.findById(userId);
    if (!profile) {
      throw new ApiError(500, "PROFILE_MISSING", "Kontoen er ikke klar. Prøv igen om lidt.");
    }
    return { userId, role: profile.role };
  }

  // Logout kræver ikke vilkårs-accept og læser ingen data (architecture 2.5).
  async logout(): Promise<void> {
    await this.auth.signOutLocal();
  }

  // En anonym session skal konverteres i stedet for at oprette en ny konto.
  async signup(terms: TermsPayload | null, input: SignupInput): Promise<AuthUserDto> {
    if (this.session?.isAnonymous) {
      throw new ApiError(409, "ANONYMOUS_SESSION_ACTIVE", "Din samtale skal konverteres til en konto i stedet.");
    }
    if (this.session) {
      throw new ApiError(409, "ALREADY_AUTHENTICATED", "Du er allerede logget ind.");
    }

    const metadata = await this.signupMetadata(input);
    const userId = await this.auth.signUp(input.email, input.password, metadata);

    if (terms) {
      await this.terms.upsertAcceptance(userId, terms);
    }
    return { userId, role: input.role };
  }

  // Metadata, som signup-triggeren handle_new_user() opretter rækkerne ud fra (architecture 4.3).
  // For en klinik forhåndstjekkes CVR'et, fordi GoTrue oversætter fejlen fra triggeren til en generisk fejl.
  private async signupMetadata(input: SignupInput): Promise<Record<string, string>> {
    if (input.role === "patient") {
      return { role: "patient", first_name: input.firstName };
    }
    if (await this.clinics.isCvrClaimed(input.cvr)) {
      throw new ApiError(409, "CLINIC_EXISTS", "Der findes allerede en konto for dette CVR-nummer.");
    }
    return {
      role: "clinic",
      cvr: input.cvr,
      clinic_name: input.clinicName,
      address: input.address,
      postal_code: input.postalCode,
      city: input.city,
      phone: input.phone,
    };
  }

  // Konverterer den indloggede anonyme bruger til en konto med samme user id (architecture 7.7).
  // Sag, samtaler, billeder og samtykker følger med, fordi id'et er uændret. Routen har sikret, at sessionen er anonym.
  async convertAnonymous(input: ConvertInput): Promise<AuthUserDto> {
    if (!this.session) {
      throw unauthenticated();
    }
    await this.auth.setCredentials(input.email, input.password);
    // Triggeren på auth.users har nu sat profiles.is_anonymous = false. Opfrisk sessionen, så JWT'en matcher.
    await this.patients.update(this.session.userId, { firstName: input.firstName });
    await this.auth.refreshSession();
    return { userId: this.session.userId, role: "patient" };
  }
}
