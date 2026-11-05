import { z } from "zod";
import { MESSAGE_MAX_CHARS } from "@/lib/common/constants/limits";

// POST /api/leads/{id}/messages (architecture 10.12). Samme grænse som check-constraintet på messages.body.
export const sendMessageSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, "Skriv en besked.")
      .max(MESSAGE_MAX_CHARS, `Beskeden må højst være ${MESSAGE_MAX_CHARS} tegn.`),
  })
  .strict();

// Tekstfeltet i en multipart-besked med billeder (10.12): valgfrit, højst MESSAGE_MAX_CHARS tegn. Antallet af billeder
// (1-MESSAGE_MAX_IMAGES) tjekkes af serveren, når formularen læses.
export const messageWithImagesSchema = z
  .object({
    body: z
      .string()
      .trim()
      .max(MESSAGE_MAX_CHARS, `Beskeden må højst være ${MESSAGE_MAX_CHARS} tegn.`)
      .default(""),
    // Kun fra klinikken (controlleren kræver dem for en klinik): afkrydset bekræftelse og den tekstversion, den hører til (M2).
    // Værdierne tjekkes af controlleren, så en forkert eller gammel version giver CONSENT_CONFIRMATION_REQUIRED.
    imageConsentConfirmed: z.string().max(10).optional(),
    imageConsentTextVersion: z.string().max(80).optional(),
  })
  .strict();
