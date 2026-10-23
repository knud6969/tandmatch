import { PRICE_ACCURACY_LABEL, PRICE_ACCURACY_VALUES, REVIEW_TEXT_MAX_CHARS, REVIEW_TEXT_MIN_CHARS, REVIEW_TRANSPARENCY_COMMENT_MAX_CHARS } from "@/lib/booking/constants/reviews";
import { createReviewSchema } from "@/lib/booking/schemas/reviews";
import type { PriceAccuracy } from "@/lib/booking/types/reviews";
import { fieldErrorsFrom, type FieldErrors } from "~/utils/field-errors";

// Anmeldelsesformularen (architecture 8.2, 13.4). Reglerne er lib's skema; her kun omsætning af formularens tekstfelter.

export type ReviewValues = {
  stars: number; // 0 = ikke valgt
  text: string;
  priceAccuracy: PriceAccuracy | null;
  actualPrice: string; // kroner som tekst, tom = ikke angivet
  lackedTransparency: boolean;
  transparencyComment: string;
};
export type ReviewField = "stars" | "text" | "priceAccuracy" | "actualPrice" | "transparencyComment";

export const REVIEW_TEXT_LIMITS = { min: REVIEW_TEXT_MIN_CHARS, max: REVIEW_TEXT_MAX_CHARS, comment: REVIEW_TRANSPARENCY_COMMENT_MAX_CHARS } as const;
export const PRICE_ACCURACY_OPTIONS = PRICE_ACCURACY_VALUES.map((value) => ({ value, label: PRICE_ACCURACY_LABEL[value] }));
export const EMPTY_REVIEW: ReviewValues = { stars: 0, text: "", priceAccuracy: null, actualPrice: "", lackedTransparency: false, transparencyComment: "" };

// "1.250", "1 250" og "1250 kr" bliver til 1250; tom tekst giver undefined; alt andet giver NaN, som skemaet afviser.
export function parseActualPrice(raw: string): number | undefined {
  const cleaned = raw.replace(/kr\.?/gi, "").replace(/[\s.]/g, "");
  if (cleaned === "") return undefined;
  return /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

export function parseReview(bookingId: string, values: ReviewValues): { ok: true; data: ReturnType<typeof createReviewSchema.parse> } | { ok: false; errors: FieldErrors<ReviewField> } {
  const actualPrice = parseActualPrice(values.actualPrice);
  const parsed = createReviewSchema.safeParse({
    bookingId,
    stars: values.stars,
    text: values.text,
    priceAccuracy: values.priceAccuracy ?? undefined,
    ...(actualPrice !== undefined ? { actualPrice } : {}),
    // "Manglede gennemsigtighed" sendes kun, når patienten har taget stilling; ikke afkrydset er det samme som ikke angivet.
    ...(values.lackedTransparency ? { lackedTransparency: true, transparencyComment: values.transparencyComment } : {}),
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors = fieldErrorsFrom<ReviewField>(parsed.error);
  if (values.stars === 0) errors.stars = "Vælg 1 til 5 stjerner.";
  if (actualPrice !== undefined && Number.isNaN(actualPrice)) errors.actualPrice = "Angiv prisen i hele kroner.";
  return { ok: false, errors };
}
