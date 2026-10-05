import type { MeDto } from "@/lib/types/auth";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import { requireTerms } from "@/server/auth/terms";
import { requireSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { getDentistSummary, getPatientFirstName } from "@/server/models/profiles";
import { jsonResponse, withApi } from "@/server/http/api";

export const GET = withApi(async () => {
  await requireTerms();
  const session = await requireSession();
  const supabase = await createSupabaseServerClient();

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
  return jsonResponse(body);
});
