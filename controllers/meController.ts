import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import type { MeDto } from "@/lib/types/auth";
import type { Session } from "@/middleware/session";
import { getPatientFirstName } from "@/models/profilesModel";

// Den indloggede bruger: rolle og visningsnavn (architecture 10.2). Klinikkens navn tilføjes i 1.1.
export async function getMe(supabase: SupabaseClient, session: Session): Promise<MeDto> {
  const displayName =
    session.role === "patient" ? await getPatientFirstName(supabase, session.userId) : null;

  return {
    id: session.userId,
    role: session.role,
    isAnonymous: session.isAnonymous,
    displayName,
    anonymousExpiresAt: session.isAnonymous ? anonymousExpiresAt(session.lastActiveAt) : null,
  };
}
