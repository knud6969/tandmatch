import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { ANONYMOUS_SESSION_HOURS } from "@/lib/identity/constants/sessions";
import { createSupabaseRequestClient, isTokenTransport, type AuthTransport } from "@/platform/db/supabase";
import { AuthRepository } from "@/features/identity/authRepository";
import { ProfilesRepository } from "@/features/identity/profilesRepository";
import { ApiError, anonymousNotAllowed, forbidden, unauthenticated } from "@/platform/middleware/http";
import type { Role } from "@/lib/common/types/common";

export type Session = {
  userId: string;
  role: Role;
  isAnonymous: boolean;
  lastActiveAt: string;
};

// Brugerens klient og verificerede bruger-id for ét kald. Oprettes én gang pr. request (requireTerms() eller
// createAuthContext()) og gives videre til requireRole() m.fl. og til controlleren, så Supabase Auth kun slås op og evt.
// fornyes ét sted pr. request. Flere klienter pr. request fornyede samme refresh token samtidig (architecture 2.4).
// `transport` er "bearer" for appen (Authorization eller X-TandMatch-Client) og ellers "cookie". `accessToken` er kun
// sat ved bearer, og kun hvis requesten har et token (routes som convert og logout bruger det).
export type AuthContext = {
  supabase: SupabaseClient;
  userId: string | null;
  transport: AuthTransport;
  accessToken: string | null;
};

// Opretter klienten og verificerer brugeren hos Supabase Auth (getUser), ikke kun cookien.
// Med bearer verificeres tokenet; et ugyldigt eller udløbet token giver 401 (også selvom requesten har en gyldig cookie,
// som ikke læses), så appen kan forny tokenet og prøve igen (architecture 2.4).
export async function createAuthContext(): Promise<AuthContext> {
  const { supabase, transport, accessToken } = await createSupabaseRequestClient();
  if (transport === "bearer" && accessToken === null) {
    return { supabase, userId: null, transport, accessToken };
  }
  const userId = await new AuthRepository(supabase).findUserId(accessToken ?? undefined);
  if (transport === "bearer" && !userId) {
    throw unauthenticated();
  }
  return { supabase, userId, transport, accessToken };
}

// Læser den aktuelle session ud fra konteksten (eller en ny, hvis kalderen ikke har en, fx layouts).
// Opdaterer last_active_at for anonyme sessioner (architecture 10.2). En anonym session, hvis seneste aktivitet er
// ældre end 48 timer, er udløbet og afvises (som ingen session), også selvom oprydningsjobbet endnu ikke har slettet den (L5).
export async function getSession(ctx?: AuthContext): Promise<Session | null> {
  const { supabase, userId } = ctx ?? (await createAuthContext());
  if (!userId) return null;

  const profiles = new ProfilesRepository(supabase);
  const profile = await profiles.findById(userId);
  if (!profile) return null;

  if (profile.isAnonymous) {
    if (Date.now() - new Date(profile.lastActiveAt).getTime() > ANONYMOUS_SESSION_HOURS * 60 * 60 * 1000) return null;
    await profiles.touchLastActive();
  }

  return {
    userId,
    role: profile.role,
    isAnonymous: profile.isAnonymous,
    lastActiveAt: profile.lastActiveAt,
  };
}

export async function requireSession(ctx?: AuthContext): Promise<Session> {
  const session = await getSession(ctx);
  if (!session) {
    throw unauthenticated();
  }
  return session;
}

// Kun for en anonym session (konvertering til konto, architecture 7.7). Tjekkes før body læses.
export async function requireAnonymous(ctx?: AuthContext): Promise<Session> {
  const session = await requireSession(ctx);
  if (!session.isAnonymous) {
    throw new ApiError(403, "NOT_ANONYMOUS", "Der er ingen anonym samtale at konvertere.");
  }
  return session;
}

// Handlinger, der kræver konto, selvom routen ellers tillader anonyme (fx afsendelse, architecture 6.2).
export function requireAccount(session: Session, message: string): Session {
  if (session.isAnonymous) {
    throw new ApiError(403, "ACCOUNT_REQUIRED", message);
  }
  return session;
}

// Rolle-tjek for API-routes. Anonyme patienter afvises, medmindre allowAnonymous er sat (kun sagsflowet).
// `role` kan være flere roller (fx beskedtråden, hvor både patient og klinik er deltagere).
export async function requireRole(
  role: Role | readonly Role[],
  options: { allowAnonymous?: boolean; ctx?: AuthContext } = {},
): Promise<Session> {
  const session = await requireSession(options.ctx);
  if (!(Array.isArray(role) ? role : [role]).includes(session.role)) {
    throw forbidden();
  }
  if (session.isAnonymous && !options.allowAnonymous) {
    throw anonymousNotAllowed();
  }
  return session;
}

// Fjerner Supabase-cookies, når kontoen er slettet, så browseren ikke beholder en død session.
// Gør intet ved bearer: appen har ingen cookies og sletter selv sine tokens.
export async function clearAuthCookies(): Promise<void> {
  if (isTokenTransport(await headers())) return;
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      cookieStore.delete(cookie.name);
    }
  }
}
