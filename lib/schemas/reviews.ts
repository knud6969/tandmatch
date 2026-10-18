import { z } from "zod";
import {
  PRICE_ACCURACY_VALUES,
  REVIEW_ACTUAL_PRICE_MAX,
  REVIEW_REPLY_MAX_CHARS,
  REVIEW_TEXT_MAX_CHARS,
  REVIEW_TEXT_MIN_CHARS,
  REVIEW_TRANSPARENCY_COMMENT_MAX_CHARS,
} from "@/lib/constants/reviews";

// POST /api/reviews (architecture 8.2, 10.13). Klinikken udledes af bookingen på serveren og kan ikke angives.
export const createReviewSchema = z
  .object({
    bookingId: z.uuid("Ugyldig booking."),
    stars: z.number().int("Vælg 1 til 5 stjerner.").min(1, "Vælg 1 til 5 stjerner.").max(5, "Vælg 1 til 5 stjerner."),
    text: z
      .string()
      .trim()
      .min(REVIEW_TEXT_MIN_CHARS, `Skriv mindst ${REVIEW_TEXT_MIN_CHARS} tegn.`)
      .max(REVIEW_TEXT_MAX_CHARS, `Anmeldelsen må højst være ${REVIEW_TEXT_MAX_CHARS} tegn.`),
    priceAccuracy: z.enum(PRICE_ACCURACY_VALUES, { message: "Vælg, om prisen svarede til prisoverslaget." }),
    actualPrice: z
      .number()
      .int("Angiv prisen i hele kroner.")
      .min(0, "Prisen kan ikke være negativ.")
      .max(REVIEW_ACTUAL_PRICE_MAX, "Prisen er for høj.")
      .optional(),
    lackedTransparency: z.boolean().optional(),
    transparencyComment: z
      .string()
      .trim()
      .max(REVIEW_TRANSPARENCY_COMMENT_MAX_CHARS, `Kommentaren må højst være ${REVIEW_TRANSPARENCY_COMMENT_MAX_CHARS} tegn.`)
      .transform((value) => (value === "" ? undefined : value))
      .optional(),
  })
  .strict();

// POST /api/reviews/{id}/reply (architecture 4.3, 10.13).
export const replyReviewSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Skriv et svar.")
      .max(REVIEW_REPLY_MAX_CHARS, `Svaret må højst være ${REVIEW_REPLY_MAX_CHARS} tegn.`),
  })
  .strict();
