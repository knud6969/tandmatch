import "server-only";
import { ApiError } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import { isTransientAuthError } from "@/models/db/authErrors";

const AUTH_LOOKUP_RETRIES = 2;

// Supabase Auth. Sessionen sættes som cookie af server-klienten (models/db/supabase.ts).
// Fejl fra Supabase oversættes her til ApiError med danske beskeder uden interne detaljer.
// Klienten er brugerens (RLS/JWT); kun deleteUser() kræver admin-klienten (architecture 2.3 f).
export class AuthRepository extends BaseRepository {
  // Verificerer brugeren hos Supabase Auth (getUser), ikke kun cookien. Mangler eller afvises sessionen, er svaret null.
  // En midlertidig fejl hos Auth (netværk, 5xx, fx under en databasenulstilling) er ikke en udløbet session: den prøves igen
  // et par gange og giver derefter 503, så brugeren aldrig sendes til login eller får 401 uden grund.
  async findUserId(): Promise<string | null> {
    for (let attempt = 0; ; attempt++) {
      const {
        data: { user },
        error,
      } = await this.db.auth.getUser();
      if (user) return user.id;
      if (!isTransientAuthError(error)) return null;
      if (attempt >= AUTH_LOOKUP_RETRIES) {
        throw new ApiError(503, "AUTH_UNAVAILABLE", "Login-tjenesten svarer ikke lige nu. Prøv igen om lidt.");
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  async signInWithPassword(email: string, password: string): Promise<string> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      // Samme besked uanset årsag, for ikke at afsløre hvilke e-mails der findes.
      throw new ApiError(401, "INVALID_CREDENTIALS", "E-mail eller adgangskode er forkert.");
    }
    return data.user.id;
  }

  // Rolle og profildata sendes som metadata. Triggeren på auth.users validerer rollen og opretter rækkerne.
  async signUp(email: string, password: string, metadata: Record<string, string>): Promise<string> {
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
    return data.user.id;
  }

  // Giver den indloggede (anonyme) bruger e-mail og adgangskode. Brugerens id er uændret.
  async setCredentials(email: string, password: string): Promise<void> {
    const { error } = await this.db.auth.updateUser({ email, password });
    if (error) {
      if (error.code === "email_exists" || error.code === "user_already_exists") {
        throw new ApiError(409, "EMAIL_EXISTS", "Der findes allerede en konto med denne e-mail.");
      }
      throw new ApiError(400, "CONVERT_FAILED", "Kontoen kunne ikke oprettes. Tjek oplysningerne.");
    }
  }

  async refreshSession(): Promise<void> {
    const { error } = await this.db.auth.refreshSession();
    if (error) throw new Error("refreshSession fejlede");
  }

  async signInAnonymously(): Promise<string> {
    const { data, error } = await this.db.auth.signInAnonymously();
    if (error || !data.user) throw new Error("signInAnonymously fejlede");
    return data.user.id;
  }

  // Scope "local" logger kun denne enhed ud (default "global" ville logge alle enheder ud).
  // En manglende session er ikke en fejl: brugeren er allerede logget ud.
  async signOutLocal(): Promise<void> {
    const { error } = await this.db.auth.signOut({ scope: "local" });
    if (error && error.name !== "AuthSessionMissingError") {
      throw new Error("signOut fejlede");
    }
  }

  // Sletter auth-brugeren. Kun med admin-klienten. Rækkerne slettes via cascade (architecture 7.7, 9.4).
  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.db.auth.admin.deleteUser(userId);
    if (error) throw new Error("auth: slet bruger fejlede");
  }
}
