import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { convertSchema, loginSchema, signupSchema } from "@/lib/schemas/auth";
import type { AuthResultDto, MobileSessionDto } from "@/lib/types/auth";
import { ApiError, unauthenticated } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import type { AuthResult } from "@/models/authRepository";
import type { TermsPayload } from "@/platform/middleware/termsCookie";
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

  // `mobile`: appen (X-TandMatch-Client: mobile) får tokens i svaret. Klienten har da ingen cookies (models/db/supabase.ts).
  async login(terms: TermsPayload | null, input: LoginInput, mobile = false): Promise<AuthResultDto> {
    const { userId, session } = await this.auth.signInWithPassword(input.email, input.password);

    if (terms) {
      await this.terms.upsertAcceptance(userId, terms);
    }

    const profile = await this.profiles.findById(userId);
    if (!profile) {
      throw new ApiError(500, "PROFILE_MISSING", "Kontoen er ikke klar. Prøv igen om lidt.");
    }
    return this.result({ userId, session }, profile.role, mobile);
  }

  // Logout kræver ikke vilkårs-accept og læser ingen data (architecture 2.5). Med bearer tilbagekaldes tokenets session.
  async logout(accessToken: string | null = null): Promise<void> {
    if (accessToken !== null) {
      await this.auth.signOutToken(accessToken);
      return;
    }
    await this.auth.signOutLocal();
  }

  // Fornyer appens tokens. Et genbrugt eller ugyldigt refresh-token giver 401 (models/authRepository.ts).
  async refresh(refreshToken: string): Promise<MobileSessionDto> {
    return this.auth.refresh(refreshToken);
  }

  // Tokens følger kun med til appen; ellers er svaret som før.
  private result(auth: AuthResult, role: AuthResultDto["role"], mobile: boolean): AuthResultDto {
    return mobile && auth.session ? { userId: auth.userId, role, session: auth.session } : { userId: auth.userId, role };
  }

  // En anonym session skal konverteres i stedet for at oprette en ny konto.
  // Appen opretter kun patienter; klinikker opretter sig på weben.
  async signup(terms: TermsPayload | null, input: SignupInput, mobile = false): Promise<AuthResultDto> {
    if (mobile && input.role !== "patient") {
      throw new ApiError(400, "VALIDATION_ERROR", "Klinikker opretter sig på weben.");
    }
    if (this.session?.isAnonymous) {
      throw new ApiError(409, "ANONYMOUS_SESSION_ACTIVE", "Din samtale skal konverteres til en konto i stedet.");
    }
    if (this.session) {
      throw new ApiError(409, "ALREADY_AUTHENTICATED", "Du er allerede logget ind.");
    }

    const metadata = await this.signupMetadata(input);
    const created = await this.auth.signUp(input.email, input.password, metadata);

    if (terms) {
      await this.terms.upsertAcceptance(created.userId, terms);
    }
    return this.result(created, input.role, mobile);
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
  // Med bearer (`accessToken`) har klienten ingen session at opfriske: brugeren logges ind igen med de nye
  // oplysninger (samme user id), og appen får de nye tokens, hvis `mobile`.
  async convertAnonymous(input: ConvertInput, mobile = false, accessToken: string | null = null): Promise<AuthResultDto> {
    if (!this.session) {
      throw unauthenticated();
    }
    await this.auth.setCredentials(input.email, input.password, accessToken ?? undefined);
    // Triggeren på auth.users har nu sat profiles.is_anonymous = false. Opfrisk sessionen, så JWT'en matcher.
    await this.patients.update(this.session.userId, { firstName: input.firstName });
    if (accessToken === null) {
      await this.auth.refreshSession();
      return { userId: this.session.userId, role: "patient" };
    }
    const renewed = await this.auth.signInWithPassword(input.email, input.password);
    return this.result({ userId: this.session.userId, session: renewed.session }, "patient", mobile);
  }
}
