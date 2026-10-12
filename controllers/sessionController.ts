import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { CONSENT_TEXT_VERSIONS } from "@/lib/constants/consents";
import { anonymousExpiresAt } from "@/lib/constants/sessions";
import type { anonymousSessionSchema } from "@/lib/schemas/session";
import type { AnonymousSessionDto } from "@/lib/types/session";
import { ApiError } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import type { TermsGate } from "@/middleware/termsGate";
import { AuthRepository } from "@/models/authRepository";
import { CasesRepository } from "@/models/casesRepository";
import { ConsentsRepository, type NewConsent } from "@/models/consentsRepository";
import { TermsRepository } from "@/models/termsRepository";

type AnonymousSessionInput = z.infer<typeof anonymousSessionSchema>;
type AnonymousSessionResult = { body: AnonymousSessionDto; status: 200 | 201 };

// `existing` er den aktuelle session, hvis gate.userId er sat (ellers null).
export class SessionController {
  private readonly auth: AuthRepository;
  private readonly terms: TermsRepository;
  private readonly consents: ConsentsRepository;
  private readonly cases: CasesRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly existing: Session | null,
  ) {
    this.auth = new AuthRepository(supabase);
    this.terms = new TermsRepository(supabase);
    this.consents = new ConsentsRepository(supabase);
    this.cases = new CasesRepository(supabase);
  }

  // Opretter en anonym session (Supabase anonymous sign-in) efter vilkårs-accept og AI-samtykke, og en tom sag
  // (architecture 10.2). Der gives kun ai_processing her, aldrig billedsamtykke (9.4). Routen kører IP-rate limit,
  // før en ny anonym bruger oprettes. AI-samtykket er valideret af skemaet (versionen er fast).
  async createAnonymous(gate: TermsGate, _input: AnonymousSessionInput): Promise<AnonymousSessionResult> {
    void _input;

    const aiConsent = (patientId: string): NewConsent => ({
      patientId,
      type: "ai_processing",
      textVersion: CONSENT_TEXT_VERSIONS.ai_processing,
      grantedWhileAnonymous: true,
    });

    // Der er allerede en session (requireTerms har kørt, så den har en accept). Retry-sikkert: det, der mangler
    // (samtykke, sag), oprettes nu, før der svares 200.
    if (gate.userId !== null) {
      const existing = this.existing;
      if (!existing) {
        throw new ApiError(401, "UNAUTHENTICATED", "Du skal være logget ind.");
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

    const userId = await this.auth.signInAnonymously();

    let caseId: string;
    try {
      await this.terms.upsertAcceptance(userId, gate.terms);
      await this.consents.createMany([aiConsent(userId)]);
      caseId = (await this.cases.create(userId)).id;
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

    return { body: { caseId, expiresAt: anonymousExpiresAt(new Date().toISOString()) }, status: 201 };
  }
}
