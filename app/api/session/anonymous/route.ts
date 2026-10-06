import { anonymousSessionSchema } from "@/lib/schemas/session";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { QUESTIONS_VERSION } from "@/lib/constants/questions";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import { requireTerms } from "@/server/auth/terms";
import { getSession } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase";
import { upsertTermsAcceptance } from "@/server/models/terms";
import { hasActiveConsent, insertConsents, type NewConsent } from "@/server/models/consents";
import { findDraftId, insertDraft } from "@/server/models/requests";
import { ApiError, jsonResponse, readJson, withApi } from "@/server/http/api";
import { enforceIpRateLimit } from "@/server/http/rate-limit";

// Opretter en anonym session (Supabase anonymous sign-in) efter vilkårs-accept og AI-samtykke.
// Kladden oprettes med den valgte kategori. Der gives kun ai_processing her, aldrig billedsamtykke (se 9.4).
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

  // Der er allerede en session (requireTerms har kørt, så den har en accept).
  if (gate.userId !== null) {
    const existing = await getSession();
    if (!existing) {
      throw new ApiError(401, "UNAUTHENTICATED", "Du skal være logget ind.");
    }
    if (!existing.isAnonymous) {
      throw new ApiError(409, "ALREADY_AUTHENTICATED", "Du er allerede logget ind.");
    }

    // Retry-sikkert: manglende samtykke gemmes nu, før der svares 200.
    if (!(await hasActiveConsent(supabase, "ai_processing"))) {
      // Vilkårs-accepten er allerede sikret af requireTerms() ovenfor, så den skrives ikke igen her.
      await insertConsents(supabase, [aiRow(existing.userId)]);
    }
    const requestId =
      (await findDraftId(supabase, existing.userId)) ??
      (await insertDraft(supabase, {
        patientId: existing.userId,
        category: input.category,
        questionsVersion: QUESTIONS_VERSION,
      }));
    return jsonResponse({ requestId, expiresAt: anonymousExpiresAt(existing.lastActiveAt) }, 200);
  }

  await enforceIpRateLimit("anonymous-session", req);
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error("signInAnonymously fejlede");
  }
  const userId = data.user.id;

  let requestId: string;
  try {
    await upsertTermsAcceptance(supabase, userId, gate.terms);
    await insertConsents(supabase, [aiRow(userId)]);
    requestId = await insertDraft(supabase, {
      patientId: userId,
      category: input.category,
      questionsVersion: QUESTIONS_VERSION,
    });
  } catch (err) {
    // Atomicitet: en anonym session må ikke stå tilbage uden AI-samtykke eller kladde. Logger ud lokalt.
    // Den anonyme bruger uden data ryddes af oprydningsjobbet.
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

  const expiresAt = anonymousExpiresAt(new Date().toISOString());
  return jsonResponse({ requestId, expiresAt }, 201);
});
