import "server-only";

// Konfiguration uden next/headers, så proxy.ts kan importere den.
// Auth-cookies er httpOnly, så browseren aldrig selv bruger tokenet (architecture 2.4).
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase-miljøvariabler mangler");
  }
  return { url, anonKey };
}
