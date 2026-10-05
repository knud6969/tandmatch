import { loginSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";
import { requireTerms } from "@/server/auth/terms";
import { upsertTermsAcceptance } from "@/server/models/terms";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { getProfile } from "@/server/models/profiles";
import { ApiError, jsonResponse, readJson, withApi } from "@/server/http/api";

export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const input = await readJson(req, loginSchema);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error || !data.user) {
    // Samme besked uanset årsag, for ikke at afsløre hvilke e-mails der findes.
    throw new ApiError(401, "INVALID_CREDENTIALS", "E-mail eller adgangskode er forkert.");
  }

  if (gate.terms) {
    await upsertTermsAcceptance(supabase, data.user.id, gate.terms);
  }

  const profile = await getProfile(supabase, data.user.id);
  if (!profile) {
    throw new ApiError(500, "PROFILE_MISSING", "Kontoen er ikke klar. Prøv igen om lidt.");
  }

  const body: AuthUserDto = { userId: data.user.id, role: profile.role };
  return jsonResponse(body, 200);
});
