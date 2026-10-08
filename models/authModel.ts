import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/middleware/http";

// Supabase Auth. Sessionen sættes som cookie af server-klienten (models/db/supabase.ts).
// Fejl fra Supabase oversættes her til ApiError med danske beskeder uden interne detaljer.

// Verificerer brugeren hos Supabase Auth (getUser), ikke kun cookien.
export async function getAuthUserId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function signInWithPassword(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Samme besked uanset årsag, for ikke at afsløre hvilke e-mails der findes.
    throw new ApiError(401, "INVALID_CREDENTIALS", "E-mail eller adgangskode er forkert.");
  }
  return data.user.id;
}

// Rolle og profildata sendes som metadata. Triggeren på auth.users validerer rollen og opretter rækkerne.
export async function signUp(
  supabase: SupabaseClient,
  email: string,
  password: string,
  metadata: Record<string, string>,
): Promise<string> {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });

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
    // Prototypen forudsætter at e-mailbekræftelse er slået fra i Supabase (architecture 7.7).
    throw new ApiError(
      409,
      "EMAIL_CONFIRMATION_REQUIRED",
      "Kontoen kræver e-mailbekræftelse, som ikke er understøttet endnu.",
    );
  }
  return data.user.id;
}

// Giver den indloggede (anonyme) bruger e-mail og adgangskode. Brugerens id er uændret.
export async function setCredentials(supabase: SupabaseClient, email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      throw new ApiError(409, "EMAIL_EXISTS", "Der findes allerede en konto med denne e-mail.");
    }
    throw new ApiError(400, "CONVERT_FAILED", "Kontoen kunne ikke oprettes. Tjek oplysningerne.");
  }
}

export async function refreshSession(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) {
    throw new Error("refreshSession fejlede");
  }
}

export async function signInAnonymously(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error("signInAnonymously fejlede");
  }
  return data.user.id;
}

// Scope "local" logger kun denne enhed ud (default "global" ville logge alle enheder ud).
// En manglende session er ikke en fejl: brugeren er allerede logget ud.
export async function signOutLocal(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error("signOut fejlede");
  }
}

// Sletter auth-brugeren (kun service role). Rækkerne slettes via cascade (architecture 7.7, 9.4).
export async function deleteAuthUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error("auth: slet bruger fejlede");
}
