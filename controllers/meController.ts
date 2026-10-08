import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import type { MeDto } from "@/lib/types/auth";
import type { Session } from "@/middleware/session";
import { getDentistSummary, getPatientFirstName } from "@/models/profilesModel";

// Den indloggede bruger: rolle, visningsnavn og (for tandlæger) verifikationsstatus (architecture 10.2).
export async function getMe(supabase: SupabaseClient, session: Session): Promise<MeDto> {
  let displayName: string | null = null;
  let dentistVerified: boolean | undefined;

  if (session.role === "patient") {
    displayName = await getPatientFirstName(supabase, session.userId);
  } else if (session.role === "dentist") {
    const dentist = await getDentistSummary(supabase, session.userId);
    displayName = dentist?.fullName ?? null;
    dentistVerified = dentist?.isVerified ?? false;
  }

  const body: MeDto = {
    id: session.userId,
    role: session.role,
    isAnonymous: session.isAnonymous,
    displayName,
    anonymousExpiresAt: session.isAnonymous ? anonymousExpiresAt(session.lastActiveAt) : null,
  };
  if (dentistVerified !== undefined) {
    body.dentistVerified = dentistVerified;
  }
  return body;
}
