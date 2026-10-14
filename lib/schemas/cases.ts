import { z } from "zod";
import { CASE_TIMEFRAMES } from "@/lib/constants/cases";
import { MAX_CONFIRMED_SERVICES_PER_CASE } from "@/lib/constants/limits";
import { postalCodeSchema } from "@/lib/schemas/clinics";

// Redigering af en kladde (architecture 10.5). Tom PATCH ændrer intet.
export const patchCaseSchema = z
  .object({
    postalCode: postalCodeSchema.optional(),
    preferredTimeframe: z.enum(CASE_TIMEFRAMES, { message: "Ukendt tidsrum." }).optional(),
  })
  .strict();

// Bekræftede ydelser (1-5, ingen dubletter). Katalogtjekket sker i controlleren.
export const putCaseServicesSchema = z
  .object({
    services: z
      .array(z.object({ serviceId: z.string().uuid("Ugyldig behandling."), suggestedByAi: z.boolean() }).strict())
      .min(1, "Vælg mindst én behandling.")
      .max(MAX_CONFIRMED_SERVICES_PER_CASE, `Vælg højst ${MAX_CONFIRMED_SERVICES_PER_CASE} behandlinger.`),
  })
  .strict()
  .refine((value) => new Set(value.services.map((s) => s.serviceId)).size === value.services.length, {
    message: "Den samme behandling kan kun vælges én gang.",
  });
