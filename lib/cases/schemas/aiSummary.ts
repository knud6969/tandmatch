import { aiSummarySchema } from "@/lib/cases/constants/ai-schemas";
import type { AiSummary } from "@/lib/cases/types/ai";

// Det gemte AI-udkast (cases.ai_summary, jsonb) parses med det fælles skema (lib/cases/constants/ai-schemas.ts, architecture
// 2.1.1: jsonb-kolonner parses med zod). Billedreferencen er case_images.id. Ugyldigt indhold behandles som `null`.

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
