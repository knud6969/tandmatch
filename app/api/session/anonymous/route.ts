import { anonymousSessionSchema } from "@/lib/schemas/session";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import { requireTerms } from "@/server/auth/terms";
import { getSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { upsertTermsAcceptance } from "@/server/models/terms";
import { hasActiveConsent, insertConsents, type NewConsent } from "@/server/models/consents";
import { ApiError, jsonResponse, readJson, withApi } from "@/server/http/api";

// Opretter en anonym session (Supabase anonymous sign-in) efter vilkårs-accept og AI-samtykke.
// Trin 1: ingen kladde endnu (requests kommer i trin 2), så kategorien valideres men gemmes ikke endnu.
export const POST = withApi(async (req) => {
  const gate = await requireTerms();
  const input = await readJson(req, anonymousSessionSchema);
  const supabase = await createSupabaseServerClient();

  const aiRow = (patientId: string): NewConsent => ({
    patientId,
    type: "ai_processing",
    textVersion: CONSENT_TEXT_VERSIONS.ai_processing,
    grantedWhileAnonymous: true,
  });
  const imageRow = (patientId: string): NewConsent => ({
    patientId,
    type: "image_upload",
    textVersion: CONSENT_TEXT_VERSIONS.image_upload,
    grantedWhileAnonymous: true,
  });

  // Der er allerede en session (requireTerms har kørt, så den har en accept).
  if (gate.userId !== null) {
    const existing = await getSession();
    if (!existing) {
      throw new ApiError(401, "UNAUTHENTICATED", "Du skal være logget ind.");
    }
    if (!existing.isAnonymous) {
      throw new ApiError(409, "ALREADY_AUTHENTICATED", "Du er allerede logget ind.");
    }

    // Retry-sikkert: manglende samtykker gemmes nu, før der svares 200.
    const missing: NewConsent[] = [];
    if (!(await hasActiveConsent(supabase, "ai_processing"))) {
      missing.push(aiRow(existing.userId));
    }
    if (input.imageConsent && !(await hasActiveConsent(supabase, "image_upload"))) {
      missing.push(imageRow(existing.userId));
    }
    if (missing.length > 0) {
      // Vilkårs-accepten er allerede sikret af requireTerms() ovenfor, så den skrives ikke igen her.
      await insertConsents(supabase, missing);
    }
    return jsonResponse({ expiresAt: anonymousExpiresAt(existing.lastActiveAt) }, 200);
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error("signInAnonymously fejlede");
  }
  const userId = data.user.id;

  try {
    await upsertTermsAcceptance(supabase, userId, gate.terms);
    const rows = [aiRow(userId)];
    if (input.imageConsent) rows.push(imageRow(userId));
    await insertConsents(supabase, rows);
  } catch (err) {
    // Atomicitet: en anonym session må ikke stå tilbage uden AI-samtykke. Logger ud, så cookies ryddes.
    // Den anonyme bruger uden data ryddes af oprydningsjobbet (trin 2).
    // En fejl i signOut må ikke overskrive den oprindelige fejl, så den kastes altid videre.
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        console.error("signOut efter fejl fejlede:", signOutError.name);
      }
    } catch {
      console.error("signOut efter fejl kastede en undtagelse");
    }
    throw err;
  }

  return jsonResponse({ expiresAt: anonymousExpiresAt(new Date().toISOString()) }, 201);
});
