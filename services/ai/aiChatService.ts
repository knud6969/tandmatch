import "server-only";
// Chat-tur mod sprogmodellen (architecture 7.2, 7.5). Klienten og reglerne gives i constructoren, så reglerne kan
// strammes (rules.ts) og klienten erstattes af en falsk i tests. Kender hverken databasen, sessionen eller routes:
// controlleren giver historik, katalog og billeder og gemmer resultatet.
// Hverken priser, klinikdata, navne eller id'er sendes: kun katalog, maskeret patienttekst og billeder (base64).

import { LIFE_THREATENING_REFERRAL_TEXT } from "@/lib/constants/ai-texts";
import { AI_TIMEOUT_MS } from "@/lib/constants/limits";
import type { ServiceGroupDto } from "@/lib/types/services";
import { buildCatalogContext, catalogSlugs } from "@/services/ai/catalogContext";
import { runChatGuard, type ChatGuardResult } from "@/services/ai/guard";
import type { ModelMessage, ModelPart, StructuredModelClient } from "@/services/ai/modelClient";
import { buildChatMessages, type HistoryMessage } from "@/services/ai/promptFormat";
import { buildChatSystemPrompt, CHAT_PROMPT_VERSION } from "@/services/ai/prompts/chat.v2";
import { AI_RULES, type AiRules } from "@/services/ai/rules";
import { CHAT_SCHEMA_NAME, CHAT_TURN_JSON_SCHEMA } from "@/services/ai/schemas";

const CHAT_MAX_OUTPUT_TOKENS = 800;

// Et billede klar til modellen: re-encodet JPEG som base64 (aldrig en signeret URL).
export type ModelImage = { data: string };

export type ChatTurnInput = {
  history: readonly HistoryMessage[]; // tidligere beskeder, ældste først (uden den nye)
  userMessage: string; // patientens nye besked, umaskeret; maskeres her
  catalog: ServiceGroupDto[]; // aktive behandlinger, hentet fra databasen ved hvert kald
  images: readonly ModelImage[]; // kun hvis patienten har givet billedsamtykke
};

export type ChatTurnOutput = ChatGuardResult & {
  model: string;
  promptVersion: string; // fx "chat.v2"
  rulesVersion: string; // fx "rules-v2"
};

export class AiChatService {
  constructor(
    private readonly client: StructuredModelClient,
    private readonly rules: AiRules = AI_RULES,
    private readonly timeoutMs: number = AI_TIMEOUT_MS,
  ) {}

  get promptVersion(): string {
    return CHAT_PROMPT_VERSION;
  }

  get rulesVersion(): string {
    return this.rules.version;
  }

  get model(): string {
    return this.client.model;
  }

  async sendTurn(input: ChatTurnInput): Promise<ChatTurnOutput> {
    const instructions = buildChatSystemPrompt(this.rules, buildCatalogContext(input.catalog));
    const messages = this.buildMessages(input);

    const result = await runChatGuard(
      { userMessage: input.userMessage, rules: this.rules, knownSlugs: catalogSlugs(input.catalog) },
      (reminder) =>
        this.client.callStructured({
          instructions: reminder ? `${instructions}\n\n${reminder}` : instructions,
          messages,
          schemaName: CHAT_SCHEMA_NAME,
          schema: CHAT_TURN_JSON_SCHEMA,
          maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
          timeoutMs: this.timeoutMs,
        }),
    );

    // Ved livstruende tegn skal 112/1813 stå i svaret, også når modellens eget svar er godkendt.
    const reply =
      result.lifeThreatening && !result.reply.includes("112")
        ? `${result.reply} ${LIFE_THREATENING_REFERRAL_TEXT}`
        : result.reply;

    return { ...result, reply, model: this.client.model, promptVersion: CHAT_PROMPT_VERSION, rulesVersion: this.rules.version };
  }

  // Seneste beskeder som data (maskeret og escapet). Billederne hører til patientens nyeste besked.
  private buildMessages(input: ChatTurnInput): ModelMessage[] {
    const messages: ModelMessage[] = buildChatMessages([...input.history, { role: "user", content: input.userMessage }]);
    const last = messages[messages.length - 1];
    if (input.images.length > 0 && last && typeof last.content === "string") {
      const parts: ModelPart[] = [
        { type: "text", text: last.content },
        ...input.images.map((image): ModelPart => ({ type: "image_jpeg_base64", data: image.data })),
      ];
      messages[messages.length - 1] = { role: last.role, content: parts };
    }
    return messages;
  }
}
