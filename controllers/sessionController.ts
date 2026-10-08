import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { anonymousSessionSchema } from "@/lib/schemas/session";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { QUESTIONS_VERSION } from "@/lib/constants/questions";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import type { TermsGate } from "@/middleware/termsGate";
import type { Session } from "@/middleware/session";
import { upsertTermsAcceptance } from "@/models/termsModel";
import { hasActiveConsent, insertConsents, type NewConsent } from "@/models/consentsModel";
import { findDraftId, insertDraft } from "@/models/requestsModel";
import { ApiError } from "@/middleware/http";
import { signInAnonymously, signOutLocal } from "@/models/authModel";

type AnonymousSessionInput = z.infer<typeof anonymousSessionSchema>;
type AnonymousSessionResult = { body: { requestId: string; expiresAt: string }; status: 200 | 201 };

// Opretter en anonym session (Supabase anonymous sign-in) efter vilkårs-accept og AI-samtykke.
// Kladden oprettes med den valgte kategori. Der gives kun ai_processing her, aldrig billedsamtykke (se 9.4).
// existing er den aktuelle session, hvis gate.userId er sat. Routen kører IP-rate limit, før en ny anonym bruger oprettes.
export async function createAnonymousSession(
  supabase: SupabaseClient,
  gate: TermsGate,
  existing: Session | null,
  input: AnonymousSessionInput,
): Promise<AnonymousSessionResult> {

  const aiRow = (patientId: string): NewConsent => ({
    patientId,
    type: "ai_processing",
    textVersion: CONSENT_TEXT_VERSIONS.ai_processing,
    grantedWhileAnonymous: true,
  });

  // Der er allerede en session (requireTerms har kørt, så den har en accept).
  if (gate.userId !== null) {
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
    return {
      body: { requestId, expiresAt: anonymousExpiresAt(existing.lastActiveAt) },
      status: 200,
    };
  }

  const userId = await signInAnonymously(supabase);

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
      await signOutLocal(supabase);
    } catch {
      console.error("signOut efter fejl fejlede");
    }
    throw err;
  }

  const expiresAt = anonymousExpiresAt(new Date().toISOString());
  return { body: { requestId, expiresAt }, status: 201 };
}
