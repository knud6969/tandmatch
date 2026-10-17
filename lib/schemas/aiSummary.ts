import { z } from "zod";
import { IMAGE_QUALITIES, IMAGE_VIEWS, OUT_OF_SCOPE_TOPICS } from "@/lib/constants/ai";
import type { AiSummary } from "@/lib/types/ai";

// Det gemte AI-udkast (cases.ai_summary, jsonb), som det læses fra databasen (architecture 2.1.1: jsonb-kolonner parses med
// zod). Formen er AiSummary (7.4), men med case_images.id som imageRef. Ugyldigt indhold behandles som `null`.
const aiSummarySchema: z.ZodType<AiSummary> = z.strictObject({
  summaryText: z.string().min(1).max(800),
  patientWishes: z.array(z.string().max(200)).max(5),
  patientReportedHistory: z.array(z.string().max(200)).max(5),
  suggestedServices: z.array(z.string().max(80)).max(5),
  images: z
    .array(
      z.strictObject({
        imageRef: z.string().min(1).max(40),
        view: z.enum(IMAGE_VIEWS),
        visibleArea: z.string().max(80),
        observations: z.array(z.string().max(120)).max(4),
        quality: z.enum(IMAGE_QUALITIES),
      }),
    )
    .max(5),
  outOfScopeTopics: z.array(z.enum(OUT_OF_SCOPE_TOPICS)).max(OUT_OF_SCOPE_TOPICS.length),
});

// Parser jsonb-værdien. Ugyldigt indhold giver null og logges uden indhold.
export function parseAiSummary(value: unknown): AiSummary | null {
  if (value === null || value === undefined) return null;
  const parsed = aiSummarySchema.safeParse(value);
  if (!parsed.success) {
    console.error("AI-udkast: ugyldigt indhold i cases.ai_summary");
    return null;
  }
  return parsed.data;
}
