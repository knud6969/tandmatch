import { z } from "zod";
import { STANDARD_SERVICES } from "@/lib/constants/standard";

export const dentistListQuerySchema = z
  .object({
    postalCode: z.string().regex(/^[0-9]{4}$/, "Angiv et gyldigt postnummer.").optional(),
    service: z.enum(STANDARD_SERVICES, "Ukendt ydelse.").optional(),
  })
  .strict();

export const createReviewSchema = z
  .object({
    visitId: z.uuid("Ugyldigt besøg."),
    stars: z.number().int("Stjerner skal være et helt tal.").min(1).max(5),
    text: z
      .string()
      .trim()
      .min(20, "Skriv mindst 20 tegn.")
      .max(2000, "Teksten må højst være 2000 tegn."),
    priceAccuracy: z.enum(["as_quoted", "slightly_higher", "much_higher"], "Vælg et svar om prisen."),
    actualPrice: z.number().int().min(0).max(1000000).nullable().optional(),
    lackedTransparency: z.boolean().nullable().optional(),
    transparencyComment: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const createReplySchema = z
  .object({
    text: z.string().trim().min(1, "Skriv et svar.").max(1000, "Svaret må højst være 1000 tegn."),
  })
  .strict();
