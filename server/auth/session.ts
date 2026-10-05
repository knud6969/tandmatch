import "server-only";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { getProfile, touchLastActive } from "@/server/models/profiles";
import { ApiError } from "@/server/http/api";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getProfile(supabase, user.id);
  if (!profile) return null;

  if (profile.isAnonymous) {
    await touchLastActive(supabase);
  }

  return {
    userId: user.id,
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

// Rolle-tjek for API-routes. Anonyme patienter afvises, medmindre allowAnonymous er sat (kun wizarden, trin 2).
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
