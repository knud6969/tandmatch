import "server-only";
import { SUMMARY_MAX_CHARS } from "@/lib/common/constants/limits";
import type { AiSummary } from "@/lib/types/ai";
import { ApiError, consentRequired, notDraft, notFound } from "@/platform/middleware/http";
import { BaseRepository } from "@/platform/base/baseRepository";

const limit = (code: string, message: string) => new ApiError(429, code, message);

// Opsummeringens funktioner (architecture 5.3). `approve` kaldes med patientens JWT (den tjekker ejer og kladde selv).
// `consumeGeneration` og `store` kan kun udføres af service role (2.3 a): kalderen gives admin-klienten og sender den
// verificerede brugers id. Funktionerne tjekker selv ejer, kladde og samtykke for det id.
export class SummaryRepository extends BaseRepository {
  // Kun service role (2.3 a). Tæller en generering (sagens loft, døgnloft og for anonyme brugerens og det globale loft) i
  // én transaktion. Returnerer, hvor mange genereringer sagen har tilbage.
  async consumeGeneration(userId: string, caseId: string): Promise<number> {
    const left = await this.rpc<number>(
      "consume_summary_generation",
      { p_user_id: userId, p_case_id: caseId },
      {
        NOT_FOUND: notFound(),
        NOT_DRAFT: notDraft(),
        CONSENT_REQUIRED: consentRequired("Du skal give samtykke til AI-behandling, før du kan få en opsummering."),
        ANON_USER_LIMIT: limit("RATE_LIMITED", "Du har brugt dine AI-kald i dag. Opret en konto for at fortsætte, eller prøv igen i morgen."),
        SUMMARY_LIMIT: limit("SUMMARY_LIMIT", "Du har brugt alle opsummeringer på denne sag. Skriv selv videre."),
        DAILY_SUMMARY_LIMIT: limit("SUMMARY_LIMIT", "Du har lavet mange opsummeringer i dag. Prøv igen i morgen."),
        ANON_CAP_REACHED: limit("ANON_CAP_REACHED", "AI-assistenten er optaget lige nu. Opret en konto eller prøv igen senere."),
      },
    );
    return left ?? 0;
  }

  // Kun service role (2.3 a). Skriver det validerede udkast; ejer og kladde tjekkes igen i funktionen.
  async store(input: { userId: string; caseId: string; summary: AiSummary; model: string; promptVersion: string }): Promise<void> {
    await this.rpc(
      "store_ai_summary",
      {
        p_user_id: input.userId,
        p_case_id: input.caseId,
        p_summary: input.summary,
        p_ai_assisted: true,
        p_model: input.model,
        p_prompt_version: input.promptVersion,
      },
      { NOT_FOUND: notFound(), NOT_DRAFT: notDraft() },
    );
  }

  // Eneste vej til summary_text (max SUMMARY_MAX_CHARS). `aiAssisted` angiver, om teksten stadig bygger på AI-udkastet;
  // databasen gemmer altid false, hvis sagen ikke har et AI-udkast. Returnerer godkendelsestidspunktet.
  async approve(caseId: string, summaryText: string, aiAssisted: boolean): Promise<string> {
    const at = await this.rpc<string>(
      "approve_summary",
      { p_case_id: caseId, p_summary_text: summaryText, p_ai_assisted: aiAssisted },
      {
        NOT_FOUND: notFound(),
        NOT_DRAFT: notDraft(),
        INVALID_SUMMARY: new ApiError(400, "VALIDATION_ERROR", `Opsummeringen skal være mellem 1 og ${SUMMARY_MAX_CHARS} tegn.`),
      },
    );
    if (!at) throw new Error("approve_summary: uventet svar");
    return at;
  }
}
