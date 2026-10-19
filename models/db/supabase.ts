import "server-only";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MOBILE_CLIENT_HEADER, MOBILE_CLIENT_VALUE } from "@/lib/constants/sessions";
import { AUTH_COOKIE_OPTIONS, getSupabaseConfig } from "@/models/db/config";

export { AUTH_COOKIE_OPTIONS, getSupabaseConfig };

export type AuthTransport = "cookie" | "bearer";

// Klienten for ét kald og hvordan sessionen blev fundet (architecture 2.4).
// accessToken er kun sat ved bearer: null = ingen Authorization-header (fx appen uden login), "" = en Authorization-header,
// der ikke er "Bearer <token>" (behandles som et ugyldigt token).
export type RequestClient = { supabase: SupabaseClient; transport: AuthTransport; accessToken: string | null };

// Læser et bearer-token fra Authorization. Returnerer null uden header og "" ved en header i forkert format.
export function parseBearer(authorization: string | null): string | null {
  if (authorization === null) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization.trim());
  return match ? match[1] : "";
}

// En klient uden cookies og uden gemt session: bruges til bearer-kald, til appens login/signup/anonym session (hvor
// sessionen kun lever i klientens hukommelse under requesten) og til refresh.
export function createSupabaseStatelessClient(accessToken?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });
}

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
          // Cache-headerne fra setAll sættes af proxy.ts for sider; API-ruter og sider, der læser cookies(), er dynamiske.
        } catch {
          // Kaldes fra en kontekst uden skrivning af cookies (fx server component). Session opfriskes i proxy.ts.
        }
      },
    },
  });
}

// Har requesten Authorization eller X-TandMatch-Client: mobile, er det appen: cookies læses og skrives aldrig
// (ingen blanding af cookie og bearer, architecture 2.4). Ellers er det den eksisterende cookie-klient.
export async function createSupabaseRequestClient(): Promise<RequestClient> {
  const h = await headers();
  const accessToken = parseBearer(h.get("authorization"));
  if (!isTokenTransport(h)) {
    return { supabase: await createSupabaseServerClient(), transport: "cookie", accessToken: null };
  }
  return { supabase: createSupabaseStatelessClient(accessToken || undefined), transport: "bearer", accessToken };
}

// Sand, når requesten kommer fra appen (Authorization eller X-TandMatch-Client: mobile): cookies bruges ikke.
export function isTokenTransport(h: Headers): boolean {
  return h.get("authorization") !== null || isMobileClient({ headers: h });
}

// Sand, når requesten kommer fra appen (headeren X-TandMatch-Client: mobile). Styrer, om tokens returneres.
export function isMobileClient(req: { headers: Headers }): boolean {
  return req.headers.get(MOBILE_CLIENT_HEADER)?.toLowerCase() === MOBILE_CLIENT_VALUE;
}
