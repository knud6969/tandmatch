// Faste labels til formularen i prompts. Kilden er de samme konstanter som UI'et bruger.
// Hvis spørgsmål eller kategorier ændres i lib/constants, ændres de automatisk her.
import { CATEGORY_OPTIONS } from "@/lib/constants/categories";
import { PLACEHOLDER_QUESTIONS } from "@/lib/constants/questions";
import type { FormLabels } from "./promptFormat";

export const FORM_LABELS: FormLabels = {
  categories: Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.value, o.label])),
  questions: Object.fromEntries(
    PLACEHOLDER_QUESTIONS.map((q) => [
      q.key,
      { label: q.label, options: Object.fromEntries(q.options.map((o) => [o.value, o.label])) },
    ]),
  ),
};
