import { z } from "zod";

// Grænser for tandlægens svar (MVP-værdier). Teksten er fri, men har længdegrænser.
const MAX_PRICE_KR = 1_000_000;

const priceSchema = z
  .number({ message: "Angiv prisen i hele kroner." })
  .int("Prisen skal være et helt antal kroner.")
  .min(0, "Prisen kan ikke være negativ.")
  .max(MAX_PRICE_KR, "Prisen er for høj.");

const firstAvailableSchema = z
  .iso.datetime({ offset: true, message: "Angiv et gyldigt tidspunkt." })
  .nullable()
  .optional()
  .refine(
    (value) => !value || Date.parse(value) >= Date.now() - 60_000,
    "Første ledige tid kan ikke ligge i fortiden.",
  );

const validUntilSchema = z
  .iso.date({ message: "Angiv en gyldig dato (ÅÅÅÅ-MM-DD)." })
  .nullable()
  .optional()
  .refine(
    (value) => !value || value >= new Date().toISOString().slice(0, 10),
    "Tilbuddets gyldighed kan ikke ligge i fortiden.",
  );

const fields = {
  assessment: z
    .string()
    .trim()
    .min(1, "Skriv din vurdering.")
    .max(2000, "Vurderingen må højst være 2000 tegn."),
  priceMin: priceSchema,
  priceMax: priceSchema,
  priceNote: z.string().trim().max(200, "Prisnoten må højst være 200 tegn.").nullable().optional(),
  firstAvailableAt: firstAvailableSchema,
  offer: z.string().trim().max(1000, "Tilbuddet må højst være 1000 tegn.").nullable().optional(),
  validUntil: validUntilSchema,
};

const priceOrderMessage = "Den laveste pris må ikke være højere end den højeste.";

// POST /api/requests/{id}/responses
export const createResponseSchema = z
  .object(fields)
  .strict()
  .refine((v) => v.priceMin <= v.priceMax, { message: priceOrderMessage, path: ["priceMax"] });

// PATCH /api/responses/{id}. Alle felter valgfri. status kan kun sættes til "withdrawn".
export const patchResponseSchema = z
  .object(fields)
  .partial()
  .extend({
    status: z.literal("withdrawn", { message: "Svaret kan kun trækkes tilbage." }).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Angiv mindst ét felt at ændre." })
  .refine(
    (v) => v.priceMin === undefined || v.priceMax === undefined || v.priceMin <= v.priceMax,
    { message: priceOrderMessage, path: ["priceMax"] },
  );
