import { z } from "zod";
import { COSMETIC_CATEGORIES } from "@/lib/constants/categories";

const answerKey = z.string().regex(/^[a-zA-Z0-9_]{1,40}$/, "Ugyldigt spørgsmålsnavn.");
const answerValue = z.union([
  z.string().max(300, "Svaret er for langt."),
  z.array(z.string().max(100)).max(10),
]);

// Svar på faste spørgsmål. Liste og typer afventer endelige spørgsmål (lib/constants/questions.ts).
export const answersSchema = z
  .record(answerKey, answerValue)
  .refine((value) => Object.keys(value).length <= 20, "For mange svar.");

export const createRequestSchema = z
  .object({
    category: z.enum(COSMETIC_CATEGORIES, "Vælg en kategori."),
  })
  .strict();

export const patchRequestSchema = z
  .object({
    category: z.enum(COSMETIC_CATEGORIES).optional(),
    answers: answersSchema.optional(),
    freeText: z.string().trim().max(2000, "Teksten må højst være 2000 tegn.").nullable().optional(),
    postalCode: z
      .string()
      .regex(/^[0-9]{4}$/, "Angiv et gyldigt postnummer.")
      .nullable()
      .optional(),
    maxDistanceKm: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const summarySchema = z
  .object({
    summaryText: z
      .string()
      .trim()
      .min(1, "Opsummeringen må ikke være tom.")
      .max(1500, "Opsummeringen må højst være 1500 tegn."),
  })
  .strict();
