import { AI_DRAFT_MIN_SHARED_WORDS, IMAGE_DESCRIPTION_MAX_CHARS } from "@/lib/common/constants/limits";
import type { AiSummary } from "@/lib/types/ai";

// Rene hjælpefunktioner til opsummeringen (architecture 10.5).

const WORD = /[\p{L}\p{N}]{3,}/gu;

// Reglen for `summary_ai_assisted`: teksten regnes som erstattet helt, når under halvdelen af patientens ord (3+ tegn)
// findes i AI-udkastet. Så vises "skrevet med AI-hjælp" ikke for en tekst, patienten har skrevet selv. Uden et AI-udkast
// på sagen er svaret altid false (databasen gentager det).
export function buildsOnAiDraft(text: string, draft: AiSummary | null): boolean {
  if (!draft) return false;
  const draftWords = new Set(draft.summaryText.toLowerCase().match(WORD) ?? []);
  const words = text.toLowerCase().match(WORD) ?? [];
  if (words.length === 0) return false;
  return words.filter((word) => draftWords.has(word)).length / words.length >= AI_DRAFT_MIN_SHARED_WORDS;
}

// Billedbeskrivelsen gemt på billedet: synligt område og observationer, afkortet til databasens grænse (tegn, ikke
// UTF-16-enheder, som char_length i Postgres), så opsummeringen ikke fejler efter at forsøget er brugt.
export function imageDescription(visibleArea: string, observations: readonly string[]): string {
  const full = [visibleArea, ...observations].join(". ");
  const chars = Array.from(full);
  return chars.length <= IMAGE_DESCRIPTION_MAX_CHARS ? full : chars.slice(0, IMAGE_DESCRIPTION_MAX_CHARS).join("").trimEnd();
}
