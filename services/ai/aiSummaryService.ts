import "server-only";
// Opsummering til klinikken (architecture 7.1, 7.2). Klient og regler gives i constructoren. Opsummeringen er
// beskrivende og indeholder aldrig den foreløbige vurdering fra chatten. Kender ikke databasen: controlleren giver
// chat, bekræftede ydelser og billeder og gemmer resultatet.

import { AI_TIMEOUT_MS } from "@/lib/constants/limits";
import type { ServiceGroupDto } from "@/lib/types/services";
import { buildCatalogContext, catalogSlugs } from "@/services/ai/catalogContext";
import type { ModelImage } from "@/services/ai/aiChatService";
import { runSummaryGuard, type SummaryGuardResult } from "@/services/ai/guard";
import type { ModelPart, StructuredModelClient } from "@/services/ai/modelClient";
import { buildTranscript, formatConfirmedServices, type HistoryMessage } from "@/services/ai/promptFormat";
import { buildSummarySystemPrompt, SUMMARY_PROMPT_VERSION } from "@/services/ai/prompts/summary.v2";
import { AI_RULES, type AiRules } from "@/services/ai/rules";
import { SUMMARY_JSON_SCHEMA, SUMMARY_SCHEMA_NAME } from "@/services/ai/schemas";

const SUMMARY_MAX_OUTPUT_TOKENS = 1200;

export type SummaryInput = {
  history: readonly HistoryMessage[]; // hele chatten, ældste først
  confirmedSlugs: readonly string[]; // patientens bekræftede ydelser
  catalog: ServiceGroupDto[];
  images: readonly (ModelImage & { imageId: string })[]; // intern reference img_n tildeles her
};

export type SummaryOutput = SummaryGuardResult & {
  model: string;
  promptVersion: string; // fx "summary.v2"
  rulesVersion: string;
};

export class AiSummaryService {
  constructor(
    private readonly client: StructuredModelClient,
    private readonly rules: AiRules = AI_RULES,
    private readonly timeoutMs: number = AI_TIMEOUT_MS,
  ) {}

  get promptVersion(): string {
    return SUMMARY_PROMPT_VERSION;
  }

  get rulesVersion(): string {
    return this.rules.version;
  }

  get model(): string {
    return this.client.model;
  }

  async generate(input: SummaryInput): Promise<SummaryOutput> {
    const instructions = buildSummarySystemPrompt(this.rules, buildCatalogContext(input.catalog));
    const refs = input.images.map((image, i) => ({ imageId: image.imageId, ref: `img_${i + 1}`, data: image.data }));

    const parts: ModelPart[] = [
      { type: "text", text: `${buildTranscript(input.history)}\n${formatConfirmedServices(input.confirmedSlugs)}` },
    ];
    for (const image of refs) {
      parts.push({ type: "text", text: `Billede ${image.ref}:` });
      parts.push({ type: "image_jpeg_base64", data: image.data });
    }

    const result = await runSummaryGuard(
      {
        history: [...input.history],
        rules: this.rules,
        knownSlugs: catalogSlugs(input.catalog),
        images: refs.map(({ imageId, ref }) => ({ imageId, ref })),
      },
      (reminder) =>
        this.client.callStructured({
          instructions: reminder ? `${instructions}\n\n${reminder}` : instructions,
          messages: [{ role: "user", content: parts }],
          schemaName: SUMMARY_SCHEMA_NAME,
          schema: SUMMARY_JSON_SCHEMA,
          maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
          timeoutMs: this.timeoutMs,
        }),
    );

    return { ...result, model: this.client.model, promptVersion: SUMMARY_PROMPT_VERSION, rulesVersion: this.rules.version };
  }
}
