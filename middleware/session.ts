import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { AuthRepository } from "@/models/authRepository";
import { ProfilesRepository } from "@/models/profilesRepository";
import { ApiError, anonymousNotAllowed, unauthenticated } from "@/middleware/http";
import type { Role } from "@/lib/types/common";

export type Session = {
  userId: string;
  role: Role;
  isAnonymous: boolean;
  lastActiveAt: string;
};

// Læser den aktuelle bruger fra JWT-cookies. Verificerer hos Supabase Auth (getUser), ikke kun cookien.
// Opdaterer last_active_at for anonyme sessioner (architecture 10.2).
export async function getSession(): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();
  const userId = await new AuthRepository(supabase).findUserId();
  if (!userId) return null;

  const profiles = new ProfilesRepository(supabase);
  const profile = await profiles.findById(userId);
  if (!profile) return null;

  if (profile.isAnonymous) {
    await profiles.touchLastActive();
  }

  return {
    userId,
    role: profile.role,
    isAnonymous: profile.isAnonymous,
    lastActiveAt: profile.lastActiveAt,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw unauthenticated();
  }
  return session;
}

// Kun for en anonym session (konvertering til konto, architecture 7.7). Tjekkes før body læses.
export async function requireAnonymous(): Promise<Session> {
  const session = await requireSession();
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
export async function requireRole(
  role: Role,
  options: { allowAnonymous?: boolean } = {},
): Promise<Session> {
  const session = await requireSession();
  if (session.role !== role) {
    throw new ApiError(403, "FORBIDDEN", "Du har ikke adgang til denne handling.");
  }
  if (session.isAnonymous && !options.allowAnonymous) {
    throw anonymousNotAllowed();
  }
  return session;
}

// Fjerner Supabase-cookies, når kontoen er slettet, så browseren ikke beholder en død session.
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      cookieStore.delete(cookie.name);
    }
  }
}
