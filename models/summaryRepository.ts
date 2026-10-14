import "server-only";
import type { AiSummary } from "@/lib/types/ai";
import { ApiError, notDraft, notFound } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";

const limit = (code: string, message: string) => new ApiError(429, code, message);

// Opsummeringens funktioner (architecture 5.3). `consumeGeneration` og `approve` kaldes med patientens JWT (de tjekker
// ejer og kladde selv). `store` kan kun udføres af service role (2.3 a): kalderen har tjekket ejer, kladde og samtykke først.
export class SummaryRepository extends BaseRepository {
  // Tæller en generering (sagens loft, døgnloft og for anonyme det globale loft) i én transaktion.
  // Returnerer, hvor mange genereringer sagen har tilbage.
  async consumeGeneration(caseId: string): Promise<number> {
    const left = await this.rpc<number>(
      "consume_summary_generation",
      { p_case_id: caseId },
      {
        NOT_FOUND: notFound(),
        NOT_DRAFT: notDraft(),
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

  // Eneste vej til summary_text (max 1500). Returnerer godkendelsestidspunktet.
  async approve(caseId: string, summaryText: string): Promise<string> {
    const at = await this.rpc<string>(
      "approve_summary",
      { p_case_id: caseId, p_summary_text: summaryText },
      {
        NOT_FOUND: notFound(),
        NOT_DRAFT: notDraft(),
        INVALID_SUMMARY: new ApiError(400, "VALIDATION_ERROR", "Opsummeringen skal være mellem 1 og 1500 tegn."),
      },
    );
    if (!at) throw new Error("approve_summary: uventet svar");
    return at;
  }
}
