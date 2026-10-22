import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { anonymousExpiresAt } from "@/lib/identity/constants/sessions";
import type { anonymousSessionSchema } from "@/lib/identity/schemas/session";
import type { AnonymousSessionDto } from "@/lib/identity/types/session";
import { ApiError, unauthenticated } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import type { TermsPayload } from "@/platform/middleware/termsCookie";
import { AuthRepository } from "@/features/identity/authRepository";
import { CasesRepository } from "@/features/cases";
import { ConsentsRepository, type NewConsent } from "@/features/identity/consentsRepository";
import { TermsRepository } from "@/features/identity/termsRepository";

type AnonymousSessionInput = z.infer<typeof anonymousSessionSchema>;
type AnonymousSessionResult = { body: AnonymousSessionDto; status: 200 | 201 };

export type SessionDeps = {
  auth: AuthRepository;
  terms: TermsRepository;
  consents: ConsentsRepository;
  cases: CasesRepository;
};

// `existing` er den aktuelle session, hvis userId er sat (ellers null).
export class SessionController {
  private readonly auth: AuthRepository;
  private readonly terms: TermsRepository;
  private readonly consents: ConsentsRepository;
  private readonly cases: CasesRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly existing: Session | null,
    deps: Partial<SessionDeps> = {},
  ) {
    this.auth = deps.auth ?? new AuthRepository(supabase);
    this.terms = deps.terms ?? new TermsRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    this.cases = deps.cases ?? new CasesRepository(supabase);
  }

  // Opretter en anonym session (Supabase anonymous sign-in) efter vilkårs-accept og AI-samtykke, og en tom sag
  // (architecture 10.2). Der gives kun ai_processing her, aldrig billedsamtykke (9.4). Routen kører IP-rate limit,
  // før en ny anonym bruger oprettes. Versionen i samtykket er den, patienten har set; skemaet kræver den aktuelle.
  async createAnonymous(
    userId: string | null,
    terms: TermsPayload | null,
    input: AnonymousSessionInput,
    mobile = false,
  ): Promise<AnonymousSessionResult> {
    const aiConsent = (patientId: string): NewConsent => ({
      patientId,
      type: "ai_processing",
      textVersion: input.aiConsent.textVersion,
      grantedWhileAnonymous: true,
    });

    // Der er allerede en session (requireTerms har kørt, så den har en accept). Retry-sikkert: det, der mangler
    // (samtykke, sag), oprettes nu, før der svares 200.
    if (userId !== null) {
      const existing = this.existing;
      if (!existing) {
        throw unauthenticated();
      }
      if (!existing.isAnonymous) {
        throw new ApiError(409, "ALREADY_AUTHENTICATED", "Du er allerede logget ind.");
      }
      if (!(await this.consents.hasActive("ai_processing"))) {
        await this.consents.createMany([aiConsent(existing.userId)]);
      }
      const draft = (await this.cases.findLatestDraft()) ?? (await this.cases.create(existing.userId));
      return { body: { caseId: draft.id, expiresAt: anonymousExpiresAt(existing.lastActiveAt) }, status: 200 };
    }

    // Uden session har requireTerms garanteret en gyldig cookie.
    if (!terms) {
      throw new ApiError(403, "TERMS_REQUIRED", "Du skal acceptere brugervilkårene og privatlivspolitikken først.");
    }
    const { userId: newUserId, session } = await this.auth.signInAnonymously();

    let caseId: string;
    try {
      await this.terms.upsertAcceptance(newUserId, terms);
      await this.consents.createMany([aiConsent(newUserId)]);
      caseId = (await this.cases.create(newUserId)).id;
    } catch (err) {
      // Atomicitet: en anonym session må ikke stå tilbage uden AI-samtykke og sag. Logger ud lokalt.
      // Den anonyme bruger uden data ryddes af oprydningsjobbet.
      try {
        await this.auth.signOutLocal();
      } catch {
        console.error("signOut efter fejl fejlede");
      }
      throw err;
    }

    // Appen får tokens i svaret ved en ny session (ved retry har den dem allerede).
    const body = { caseId, expiresAt: anonymousExpiresAt(new Date().toISOString()), ...(mobile && session ? { session } : {}) };
    return { body, status: 201 };
  }
}
