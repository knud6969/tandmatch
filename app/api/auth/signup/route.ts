import { signupSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";
import { requireTerms } from "@/server/auth/terms";
import { upsertTermsAcceptance } from "@/server/models/terms";
import { getSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { ApiError, jsonResponse, readJson, withApi } from "@/server/http/api";
import { enforceIpRateLimit } from "@/server/http/rate-limit";

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  await enforceIpRateLimit("signup", req);
  const input = await readJson(req, signupSchema);

  const existing = await getSession();
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

  // Rolle og profildata sendes som metadata. Triggeren på auth.users validerer rollen og opretter rækkerne.
  const metadata =
    input.role === "patient"
      ? { role: "patient", first_name: input.firstName }
      : {
          role: "dentist",
          full_name: input.fullName,
          authorization_id: input.authorizationId,
        };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: metadata },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      throw new ApiError(409, "EMAIL_EXISTS", "Der findes allerede en konto med denne e-mail.");
    }
    if (error.status && error.status >= 400 && error.status < 500) {
      throw new ApiError(400, "SIGNUP_FAILED", "Kontoen kunne ikke oprettes. Tjek oplysningerne.");
    }
    throw error;
  }
  if (!data.user) {
    throw new Error("signUp uden bruger");
  }
  if (!data.session) {
    // Prototypen forudsætter at e-mailbekræftelse er slået fra i Supabase (architecture 7.7).
    throw new ApiError(
      409,
      "EMAIL_CONFIRMATION_REQUIRED",
      "Kontoen kræver e-mailbekræftelse, som ikke er understøttet endnu.",
    );
  }

  if (gate.terms) {
    await upsertTermsAcceptance(supabase, data.user.id, gate.terms);
  }

  const body: AuthUserDto = { userId: data.user.id, role: input.role };
  return jsonResponse(body, 201);
});
