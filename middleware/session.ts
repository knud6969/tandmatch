import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/models/db/supabase";
import { getAuthUserId } from "@/models/authModel";
import { getProfile, touchLastActive } from "@/models/profilesModel";
import { ApiError } from "@/middleware/http";
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
  const userId = await getAuthUserId(supabase);
  if (!userId) return null;

  const profile = await getProfile(supabase, userId);
  if (!profile) return null;

  if (profile.isAnonymous) {
    await touchLastActive(supabase);
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
    throw new ApiError(401, "UNAUTHENTICATED", "Du skal være logget ind.");
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

// Rolle-tjek for API-routes, der deles af patient og tandlæge (fx beskedtråd og svar). Anonyme afvises.
export async function requireParticipant(): Promise<Session & { role: "patient" | "clinic" }> {
  const session = await requireSession();
  if (session.role !== "patient" && session.role !== "clinic") {
    throw new ApiError(403, "FORBIDDEN", "Du har ikke adgang til denne handling.");
  }
  if (session.isAnonymous) {
    throw new ApiError(403, "ANONYMOUS_NOT_ALLOWED", "Opret en konto for at fortsætte.");
  }
  return { ...session, role: session.role };
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
    throw new ApiError(
      403,
      "ANONYMOUS_NOT_ALLOWED",
      "Opret en konto for at fortsætte.",
    );
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
