import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTransientAuthError } from "@/platform/db/authErrors";
import { AUTH_COOKIE_OPTIONS, getSupabaseConfig } from "@/platform/db/config";
import { TERMS_COOKIE, verifyCurrentTermsCookie } from "@/platform/middleware/termsCookie";
import { safeInternalPath } from "@/lib/common/navigation/paths";

// Sider der altid er tilgængelige uden vilkårs-accept (architecture 2.5, 6.1).
const TERMS_EXEMPT_PREFIXES = ["/vilkaar", "/privatliv"];
// Områder der kræver login (grov redirect; rollen tjekkes i layouts og API).
const LOGIN_REQUIRED_PREFIXES = ["/klinik", "/admin"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function redirectTo(request: NextRequest, path: string, response?: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(new URL(path, request.nextUrl.origin));
  // Eventuelle opfriskede auth-cookies fra response videreføres til redirect-svaret.
  response?.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // API-routes håndhæver selv vilkår via requireTerms() og svarer 403 TERMS_REQUIRED.
  // En redirect til HTML ville ødelægge fetch-kald, og en session uden cookie (ny enhed) skal stadig kunne bruge API'et.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const isTermsExempt = TERMS_EXEMPT_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
  if (!isTermsExempt) {
    const terms = await verifyCurrentTermsCookie(request.cookies.get(TERMS_COOKIE)?.value);
    if (!terms) {
      const naeste = encodeURIComponent(`${pathname}${search}`);
      return redirectTo(request, `/vilkaar/accepter?naeste=${naeste}`);
    }
  }

  // Opfrisker Supabase-sessionen, så tokens ikke udløber midt i et besøg.
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseConfig();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS });
        }
        // Svar med auth-cookies må ikke caches af CDN eller proxy (anbefalet af @supabase/ssr).
        for (const [key, value] of Object.entries(cacheHeaders)) {
          response.headers.set(key, value);
        }
      },
    },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const needsLogin = LOGIN_REQUIRED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
  // En midlertidig fejl hos Supabase Auth betyder ikke, at brugeren er logget ud: siden får lov at rendere, og
  // områdevagten i layoutet prøver igen (og viser fejlsiden, hvis Auth stadig ikke svarer) frem for at sende til login.
  if (needsLogin && !user && !isTransientAuthError(authError)) {
    const target = safeInternalPath(`${pathname}${search}`);
    const loginPath = target ? `/login?naeste=${encodeURIComponent(target)}` : "/login";
    return redirectTo(request, loginPath, response);
  }

  return response;
}

export const config = {
  matcher: [
    // Springer over statiske filer og billedoptimering. API-ruter filtreres i funktionen.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|txt|map)$).*)",
  ],
};
