import { z } from "zod";
import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";

// Afsendelse af en sag til 1-3 klinikker (architecture 10.5). Loftet på aktive og samlede leads tjekkes i databasen.
export const sendLeadsSchema = z
  .object({
    clinicIds: z
      .array(z.string().uuid("Ugyldig klinik."))
      .min(1, "Vælg mindst én klinik.")
      .max(MAX_ACTIVE_LEADS_PER_CASE, `Vælg højst ${MAX_ACTIVE_LEADS_PER_CASE} klinikker.`),
  })
  .strict()
  .refine((value) => new Set(value.clinicIds).size === value.clinicIds.length, {
    message: "Den samme klinik kan kun vælges én gang.",
  });

// Tilbagetrækning har tom body.
export const withdrawLeadSchema = z.object({}).strict();
