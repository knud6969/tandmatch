import "server-only";

// Konfiguration uden next/headers, så proxy.ts kan importere den.
// Auth-cookies er httpOnly, så browseren aldrig selv bruger tokenet (architecture 2.4).
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

// Supabase-klienten tilføjer selv /rest/v1, /auth/v1 osv. URL'en skal derfor være projektets basis-URL.
// Et /rest/v1-suffiks i .env.local gav "Invalid path specified" på auth-kald, så det fjernes her.
export function getSupabaseConfig(): { url: string; anonKey: string } {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) {
    throw new Error("Supabase-miljøvariabler mangler");
  }
  const url = rawUrl.replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  return { url, anonKey };
}
