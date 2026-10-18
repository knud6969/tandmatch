import { z } from "zod";
import { MAX_PRICE_DKK } from "@/lib/constants/clinics";
import {
  LEAD_CLINIC_DECLINE_REASONS,
  LEAD_COMMENT_MAX_CHARS,
  LEAD_DECLINE_NOTE_MAX_CHARS,
  LEAD_STATUSES,
} from "@/lib/constants/leads";
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

// GET /api/leads?status= (architecture 10.9).
export const clinicLeadsQuerySchema = z.object({ status: z.enum(LEAD_STATUSES, "Ugyldig status.").optional() });

const price = z.number().int("Prisen skal være i hele kroner.").min(0, "Prisen kan ikke være negativ.").max(MAX_PRICE_DKK, "Prisen er for høj.");

// Klinikkens beslutning (architecture 10.9). Præciseret pris er valgfri, men min og max hører sammen.
// `clinic_left` kan ikke vælges: den sættes kun af systemet, når klinikkontoen slettes.
export const leadDecisionSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("accept"),
      comment: z.string().trim().max(LEAD_COMMENT_MAX_CHARS, `Kommentaren må højst være ${LEAD_COMMENT_MAX_CHARS} tegn.`).optional(),
      quotedPriceMin: price.optional(),
      quotedPriceMax: price.optional(),
    })
    .strict()
    .refine((v) => (v.quotedPriceMin === undefined) === (v.quotedPriceMax === undefined), {
      message: "Angiv både laveste og højeste pris.",
    })
    .refine((v) => v.quotedPriceMin === undefined || v.quotedPriceMax === undefined || v.quotedPriceMin <= v.quotedPriceMax, {
      message: "Laveste pris kan ikke være højere end højeste pris.",
    }),
  z
    .object({
      decision: z.literal("decline"),
      reason: z.enum(LEAD_CLINIC_DECLINE_REASONS, "Vælg en begrundelse."),
      note: z.string().trim().max(LEAD_DECLINE_NOTE_MAX_CHARS, `Noten må højst være ${LEAD_DECLINE_NOTE_MAX_CHARS} tegn.`).optional(),
    })
    .strict(),
]);
