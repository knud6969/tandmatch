import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, getSupabaseConfig } from "@/server/db/config";

export { AUTH_COOKIE_OPTIONS, getSupabaseConfig };

// Server-klient med brugerens JWT fra cookies. Al databaseadgang går gennem den, så RLS gælder.
export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS });
          }
        } catch {
          // Kaldes fra en kontekst uden skrivning af cookies (fx server component). Session opfriskes i proxy.ts.
        }
      },
    },
  });
}
