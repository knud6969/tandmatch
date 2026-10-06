import { z } from "zod";
import { COSMETIC_CATEGORIES } from "@/lib/constants/categories";
import { QUESTION_DEFINITIONS } from "@/lib/constants/questions";

export type Answers = Record<string, string | string[]>;

// Svar på faste spørgsmål. Kun kendte nøgler og tilladte værdier (lib/constants/questions.ts).
// Længden er begrænset af listerne, så der kan ikke sendes fri tekst her (fri tekst ligger i freeText).
export const answersSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => {
    for (const [key, answer] of Object.entries(value)) {
      const definition = (QUESTION_DEFINITIONS as Record<string, { multiple: boolean; options: readonly string[] }>)[key];
      if (!definition) {
        ctx.addIssue({ code: "custom", message: "Ukendt spørgsmål.", path: [key] });
        continue;
      }
      const allowed = definition.options as readonly string[];
      if (definition.multiple) {
        const valid =
          Array.isArray(answer) &&
          answer.every((v) => typeof v === "string" && allowed.includes(v)) &&
          new Set(answer).size === answer.length;
        if (!valid) {
          ctx.addIssue({ code: "custom", message: "Ugyldigt svar.", path: [key] });
        }
      } else if (typeof answer !== "string" || !allowed.includes(answer)) {
        ctx.addIssue({ code: "custom", message: "Ugyldigt svar.", path: [key] });
      }
    }
  })
  .transform((value) => value as Answers);

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
