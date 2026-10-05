import { convertSchema } from "@/lib/schemas/auth";
import type { AuthUserDto } from "@/lib/types/auth";
import { requireTerms } from "@/server/auth/terms";
import { requireSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { updateFirstName } from "@/server/models/patients";
import { ApiError, jsonResponse, readJson, withApi } from "@/server/http/api";

// Konverterer den indloggede anonyme bruger til en konto med samme user id (architecture 7.7).
// Kladde, samtaler, billeder og samtykker følger med, fordi id'et er uændret.
export const POST = withApi(async (req) => {
  await requireTerms();
  const session = await requireSession();
  if (!session.isAnonymous) {
    throw new ApiError(403, "NOT_ANONYMOUS", "Der er ingen anonym samtale at konvertere.");
  }
  const input = await readJson(req, convertSchema);

  const supabase = await createSupabaseServerClient();
  const { error: updateError } = await supabase.auth.updateUser({
    email: input.email,
    password: input.password,
  });
  if (updateError) {
    if (updateError.code === "email_exists" || updateError.code === "user_already_exists") {
      throw new ApiError(409, "EMAIL_EXISTS", "Der findes allerede en konto med denne e-mail.");
    }
    throw new ApiError(400, "CONVERT_FAILED", "Kontoen kunne ikke oprettes. Tjek oplysningerne.");
  }

  // Triggeren på auth.users har nu sat profiles.is_anonymous = false. Opfrisk sessionen, så JWT'en matcher.
  await updateFirstName(supabase, session.userId, input.firstName);

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    throw new Error("refreshSession fejlede");
  }

  const body: AuthUserDto = { userId: session.userId, role: "patient" };
  return jsonResponse(body, 200);
});
