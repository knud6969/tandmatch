import "server-only";
import sharp from "sharp";
import { AI_TIMEOUT_MS } from "@/lib/constants/limits";
import { runSummaryGuard, type SummaryGuardResult } from "@/services/ai/guard";
import { callStructured, type ModelMessage, type ModelPart } from "@/services/ai/openai";
import { maskPii } from "@/services/ai/pii";
import { FORM_LABELS } from "@/services/ai/formLabels";
import { formatFormData, wrapAssistantText, wrapPatientInput } from "@/services/ai/promptFormat";
import { SUMMARY_INSTRUCTIONS } from "@/services/ai/prompts/summary.v1";
import { SUMMARY_JSON_SCHEMA } from "@/services/ai/schemas";

export type SummaryImageBytes = { imageId: string; bytes: Buffer };

export type GenerateSummaryInput = {
  category: string;
  answers: Record<string, string | string[]>;
  freeText: string | null;
  history: { role: "user" | "assistant"; content: string }[];
  images: SummaryImageBytes[];
};

// Billedet re-encodes til JPEG max 1024 px. sharp fjerner EXIF/GPS som standard. Ingen URL'er sendes.
async function prepareForModel(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { failOn: "error", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

function buildParts(input: GenerateSummaryInput, images: { ref: string; jpeg: Buffer }[]): ModelPart[] {
  const formData = `${formatFormData(input.category, input.answers, FORM_LABELS)}${
    input.freeText ? `\n${wrapPatientInput(maskPii(input.freeText))}` : ""
  }`;

  const transcript = input.history
    .map((m) => (m.role === "user" ? wrapPatientInput(maskPii(m.content)) : wrapAssistantText(m.content)))
    .join("\n");

  const parts: ModelPart[] = [{ type: "text", text: `${formData}\n\n<transcript>\n${transcript}\n</transcript>` }];
  for (const img of images) {
    parts.push({ type: "text", text: `${img.ref}:` });
    parts.push({ type: "image_jpeg_base64", data: img.jpeg.toString("base64") });
  }
  return parts;
}

// Ét udkast med ét valideret svar. Billeder sendes som base64, aldrig som links (architecture 7.2).
export async function generateSummary(input: GenerateSummaryInput): Promise<SummaryGuardResult> {
  const prepared = await Promise.all(
    input.images.map(async (img, index) => ({
      imageId: img.imageId,
      ref: `img_${index + 1}`,
      jpeg: await prepareForModel(img.bytes),
    })),
  );

  const parts = buildParts(input, prepared);
  const messages: ModelMessage[] = [{ role: "user", content: parts }];

  return runSummaryGuard(
    {
      category: input.category,
      answers: input.answers,
      freeText: input.freeText,
      history: input.history,
      images: prepared.map(({ imageId, ref }) => ({ imageId, ref })),
    },
    (retryReminder) =>
      callStructured({
        instructions: retryReminder ? `${SUMMARY_INSTRUCTIONS}\n\n${retryReminder}` : SUMMARY_INSTRUCTIONS,
        messages,
        schemaName: "summary",
        schema: SUMMARY_JSON_SCHEMA,
        maxOutputTokens: 1500,
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
}
