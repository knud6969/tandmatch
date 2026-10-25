import "server-only";
import type { Session as AuthSession } from "@supabase/supabase-js";
import type { MobileSessionDto } from "@/lib/identity/types/auth";
import { RECOVERY_INVALID_TEXT, SAME_PASSWORD_TEXT } from "@/lib/common/constants/error-texts";
import { ApiError, unauthenticated } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";
import { isTransientAuthError } from "@/platform/db/authErrors";
import { getSupabaseConfig } from "@/platform/db/config";

const AUTH_LOOKUP_RETRIES = 2;

const authUnavailable = () =>
  new ApiError(503, "AUTH_UNAVAILABLE", "Login-tjenesten svarer ikke lige nu. Prøv igen om lidt.");

// Hvordan sessionen blev oprettet (JWT-claimet amr), fx { method: "password" } eller { method: "otp" } for et e-maillink.
export type AuthMethod = { method: string; timestamp: number };

// Koden fra et nulstillingslink (architecture 10.2): PKCE-kode eller token_hash.
export type RecoveryCode = { code: string } | { tokenHash: string };

// Brugerens id og, hvis klienten har en session i hukommelsen, tokens til appen.
export type AuthResult = { userId: string; session: MobileSessionDto | null };

// Tokens til appen. Må aldrig logges eller indgå i fejlbeskeder.
function toMobileSession(session: AuthSession | null | undefined): MobileSessionDto | null {
  if (!session) return null;
  const expiresAtSeconds = session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}

// Supabase Auth. Sessionen sættes som cookie af server-klienten (platform/db/supabase.ts).
// Fejl fra Supabase oversættes her til ApiError med danske beskeder uden interne detaljer.
// Klienten er brugerens (RLS/JWT); kun deleteUser() kræver admin-klienten (architecture 2.3 f).
export class AuthRepository extends BaseRepository {
  // Verificerer brugeren hos Supabase Auth (getUser), ikke kun cookien. Mangler eller afvises sessionen, er svaret null.
  // En midlertidig fejl hos Auth (netværk, 5xx, fx under en databasenulstilling) er ikke en udløbet session: den prøves igen
  // et par gange og giver derefter 503, så brugeren aldrig sendes til login eller får 401 uden grund.
  //
  // Med accessToken (bearer) verificeres tokenet selv; klienten har ingen session. Et tomt token er altid ugyldigt.
  async findUserId(accessToken?: string): Promise<string | null> {
    if (accessToken === "") return null;
    for (let attempt = 0; ; attempt++) {
      const {
        data: { user },
        error,
      } = await this.db.auth.getUser(accessToken);
      if (user) return user.id;
      if (!isTransientAuthError(error)) return null;
      if (attempt >= AUTH_LOOKUP_RETRIES) {
        throw authUnavailable();
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      // Samme besked uanset årsag, for ikke at afsløre hvilke e-mails der findes.
      throw new ApiError(401, "INVALID_CREDENTIALS", "E-mail eller adgangskode er forkert.");
    }
    return { userId: data.user.id, session: toMobileSession(data.session) };
  }

  // Rolle og profildata sendes som metadata. Triggeren på auth.users validerer rollen og opretter rækkerne.
  async signUp(email: string, password: string, metadata: Record<string, string>): Promise<AuthResult> {
    const { data, error } = await this.db.auth.signUp({ email, password, options: { data: metadata } });

    if (error) {
      if (error.code === "user_already_exists" || error.code === "email_exists") {
        throw new ApiError(409, "EMAIL_EXISTS", "Der findes allerede en konto med denne e-mail.");
      }
      if (error.status && error.status >= 400 && error.status < 500) {
        throw new ApiError(400, "SIGNUP_FAILED", "Kontoen kunne ikke oprettes. Tjek oplysningerne.");
      }
      throw error;
    }
    if (!data.user) {
      throw new Error("signUp uden bruger");
    }
    if (!data.session) {
      // Prototypen forudsætter at e-mailbekræftelse er slået fra i Supabase (architecture 2.3.1).
      throw new ApiError(
        409,
        "EMAIL_CONFIRMATION_REQUIRED",
        "Kontoen kræver e-mailbekræftelse, som ikke er understøttet endnu.",
      );
    }
    return { userId: data.user.id, session: toMobileSession(data.session) };
  }

  // Giver den indloggede (anonyme) bruger e-mail og adgangskode. Brugerens id er uændret.
  // Med accessToken (bearer) har klienten ingen session at opdatere, så GoTrue kaldes direkte med tokenet.
  async setCredentials(email: string, password: string, accessToken?: string): Promise<void> {
    if (accessToken) {
      await this.setCredentialsWithToken(email, password, accessToken);
      return;
    }
    const { error } = await this.db.auth.updateUser({ email, password });
    if (error) {
      if (error.code === "email_exists" || error.code === "user_already_exists") {
        throw new ApiError(409, "EMAIL_EXISTS", "Der findes allerede en konto med denne e-mail.");
      }
      throw new ApiError(400, "CONVERT_FAILED", "Kontoen kunne ikke oprettes. Tjek oplysningerne.");
    }
  }

  private async setCredentialsWithToken(email: string, password: string, accessToken: string): Promise<void> {
    const { url, anonKey } = getSupabaseConfig();
    let res: Response;
    try {
      res = await fetch(`${url}/auth/v1/user`, {
        method: "PUT",
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw authUnavailable();
    }
    if (res.ok) return;
    if (res.status >= 500) throw authUnavailable();
    const body = (await res.json().catch(() => null)) as { error_code?: string } | null;
    if (res.status === 401) throw unauthenticated();
    if (body?.error_code === "email_exists" || body?.error_code === "user_already_exists") {
      throw new ApiError(409, "EMAIL_EXISTS", "Der findes allerede en konto med denne e-mail.");
    }
    throw new ApiError(400, "CONVERT_FAILED", "Kontoen kunne ikke oprettes. Tjek oplysningerne.");
  }

  async refreshSession(): Promise<void> {
    const { error } = await this.db.auth.refreshSession();
    if (error) throw new Error("refreshSession fejlede");
  }

  async signInAnonymously(): Promise<AuthResult> {
    const { data, error } = await this.db.auth.signInAnonymously();
    if (error || !data.user) throw new Error("signInAnonymously fejlede");
    return { userId: data.user.id, session: toMobileSession(data.session) };
  }

  // Fornyer appens session med et refresh-token (klient uden cookies). Et ugyldigt, udløbet eller genbrugt token giver 401;
  // en midlertidig fejl hos Auth giver 503, så appen ikke logger brugeren ud uden grund.
  async refresh(refreshToken: string): Promise<MobileSessionDto> {
    const { data, error } = await this.db.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      if (isTransientAuthError(error)) throw authUnavailable();
      throw unauthenticated();
    }
    const session = toMobileSession(data.session);
    if (!session) throw unauthenticated();
    return session;
  }

  // Tilbagekalder appens session (scope local: kun denne enhed) med adgangstokenet. Et token, der allerede er ugyldigt
  // eller udløbet, er ikke en fejl: der er intet at tilbagekalde, og appen sletter sine tokens uanset.
  async signOutToken(accessToken: string): Promise<void> {
    if (!accessToken) return;
    const { error } = await this.db.auth.admin.signOut(accessToken, "local");
    if (error && !(error.status !== undefined && error.status >= 400 && error.status < 500)) {
      throw new Error("signOut fejlede");
    }
  }

  // Scope "local" logger kun denne enhed ud (default "global" ville logge alle enheder ud).
  // En manglende session er ikke en fejl: brugeren er allerede logget ud.
  async signOutLocal(): Promise<void> {
    await this.signOut("local");
  }

  // "global": alle brugerens sessioner (efter nulstilling); "others": alle undtagen denne (efter skift af adgangskode).
  async signOut(scope: "local" | "global" | "others"): Promise<void> {
    const { error } = await this.db.auth.signOut({ scope });
    if (error && error.name !== "AuthSessionMissingError") {
      throw new Error("signOut fejlede");
    }
  }

  // Beder Supabase sende et link til at vælge en ny adgangskode. Returnerer false ved enhver fejl, også når e-mailen ikke
  // kan sendes; controlleren svarer ens uanset (ingen konto-opregning, architecture 10.2). Fejlen logges ikke her.
  async requestPasswordReset(email: string, redirectTo: string): Promise<boolean> {
    try {
      const { error } = await this.db.auth.resetPasswordForEmail(email, { redirectTo });
      return !error;
    } catch {
      return false;
    }
  }

  // Bytter koden fra nulstillingslinket til en session (cookies sættes af server-klienten). Ugyldig, brugt eller udløbet
  // kode, eller en PKCE-kode uden code verifier i denne browser: 400 RECOVERY_INVALID.
  async startRecoverySession(input: RecoveryCode): Promise<void> {
    const { error } =
      "code" in input
        ? await this.db.auth.exchangeCodeForSession(input.code)
        : await this.db.auth.verifyOtp({ type: "recovery", token_hash: input.tokenHash });
    if (error) {
      if (isTransientAuthError(error)) throw authUnavailable();
      throw new ApiError(400, "RECOVERY_INVALID", RECOVERY_INVALID_TEXT);
    }
  }

  // Sessionens verificerede amr-claim (getClaims verificerer JWT'en). Ingen eller ugyldig session: tom liste.
  async authMethods(): Promise<AuthMethod[]> {
    const { data, error } = await this.db.auth.getClaims();
    if (error) {
      if (isTransientAuthError(error)) throw authUnavailable();
      return [];
    }
    const amr = (data?.claims as { amr?: unknown } | undefined)?.amr;
    if (!Array.isArray(amr)) return [];
    return amr.filter(
      (entry): entry is AuthMethod =>
        typeof entry === "object" && entry !== null && typeof entry.method === "string" && typeof entry.timestamp === "number",
    );
  }

  // Den indloggede brugers login-e-mail (verificeret hos Auth). Ingen session: null.
  async currentEmail(): Promise<string | null> {
    const {
      data: { user },
      error,
    } = await this.db.auth.getUser();
    if (error && isTransientAuthError(error)) throw authUnavailable();
    return user?.email ?? null;
  }

  // Ny adgangskode for den indloggede bruger. Samme som før: 400 SAME_PASSWORD; for svag efter Supabase' regler: 400.
  async updatePassword(password: string): Promise<void> {
    const { error } = await this.db.auth.updateUser({ password });
    if (!error) return;
    if (error.code === "same_password") throw new ApiError(400, "SAME_PASSWORD", SAME_PASSWORD_TEXT);
    if (error.code === "weak_password") {
      throw new ApiError(400, "VALIDATION_ERROR", "Adgangskoden er for svag. Vælg en længere adgangskode.");
    }
    if (isTransientAuthError(error)) throw authUnavailable();
    if (error.name === "AuthSessionMissingError" || error.status === 401) throw unauthenticated();
    throw new Error("updateUser (adgangskode) fejlede");
  }

  // Starter et skift af login-e-mail; Supabase sender bekræftelseslinks. "exists": adressen har allerede en konto
  // (controlleren svarer ens, architecture 10.2).
  async requestEmailChange(email: string, redirectTo: string): Promise<"sent" | "exists"> {
    const { error } = await this.db.auth.updateUser({ email }, { emailRedirectTo: redirectTo });
    if (!error) return "sent";
    if (error.code === "email_exists" || error.code === "user_already_exists") return "exists";
    if (isTransientAuthError(error)) throw authUnavailable();
    if (error.name === "AuthSessionMissingError" || error.status === 401) throw unauthenticated();
    throw new Error("updateUser (e-mail) fejlede");
  }

  // Sletter auth-brugeren. Kun med admin-klienten. Rækkerne slettes via cascade (architecture 7.7, 9.4).
  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.db.auth.admin.deleteUser(userId);
    if (error) throw new Error("auth: slet bruger fejlede");
  }
}
