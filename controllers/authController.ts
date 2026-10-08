import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { loginSchema, signupSchema, convertSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";
import type { TermsGate } from "@/middleware/termsGate";
import { upsertTermsAcceptance } from "@/models/termsModel";
import type { Session } from "@/middleware/session";
import { ApiError } from "@/middleware/http";
import { getProfile } from "@/models/profilesModel";
import { updateFirstName } from "@/models/patientsModel";
import { refreshSession, setCredentials, signInWithPassword, signOutLocal, signUp } from "@/models/authModel";
import type { z } from "zod";

type LoginInput = z.infer<typeof loginSchema>;
type SignupInput = z.infer<typeof signupSchema>;
type ConvertInput = z.infer<typeof convertSchema>;

export async function login(supabase: SupabaseClient, gate: TermsGate, input: LoginInput): Promise<AuthUserDto> {
  const userId = await signInWithPassword(supabase, input.email, input.password);

  if (gate.terms) {
    await upsertTermsAcceptance(supabase, userId, gate.terms);
  }

  const profile = await getProfile(supabase, userId);
  if (!profile) {
    throw new ApiError(500, "PROFILE_MISSING", "Kontoen er ikke klar. Prøv igen om lidt.");
  }

  return { userId, role: profile.role };
}

// Logout kræver ikke vilkårs-accept og læser ingen data (architecture 2.5).
export async function logout(supabase: SupabaseClient): Promise<void> {
  await signOutLocal(supabase);
}

// existing er den aktuelle session (eller null). En anonym session skal konverteres i stedet.
export async function signup(
  supabase: SupabaseClient,
  gate: TermsGate,
  existing: Session | null,
  input: SignupInput,
): Promise<AuthUserDto> {
  if (existing?.isAnonymous) {
    throw new ApiError(
      409,
      "ANONYMOUS_SESSION_ACTIVE",
      "Din samtale skal konverteres til en konto i stedet.",
    );
  }
  if (existing) {
    throw new ApiError(409, "ALREADY_AUTHENTICATED", "Du er allerede logget ind.");
  }

  const metadata: Record<string, string> =
    input.role === "patient"
      ? { role: "patient", first_name: input.firstName }
      : {
          role: "dentist",
          full_name: input.fullName,
          authorization_id: input.authorizationId,
        };

  const userId = await signUp(supabase, input.email, input.password, metadata);

  if (gate.terms) {
    await upsertTermsAcceptance(supabase, userId, gate.terms);
  }

  return { userId, role: input.role };
}

// Konverterer den indloggede anonyme bruger til en konto med samme user id (architecture 7.7).
// Kladde, samtaler, billeder og samtykker følger med, fordi id'et er uændret. Routen har sikret, at sessionen er anonym.
export async function convertAnonymous(
  supabase: SupabaseClient,
  session: Session,
  input: ConvertInput,
): Promise<AuthUserDto> {
  await setCredentials(supabase, input.email, input.password);

  // Triggeren på auth.users har nu sat profiles.is_anonymous = false. Opfrisk sessionen, så JWT'en matcher.
  await updateFirstName(supabase, session.userId, input.firstName);

  await refreshSession(supabase);

  return { userId: session.userId, role: "patient" };
}
