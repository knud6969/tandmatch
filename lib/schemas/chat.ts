import { z } from "zod";
import { CHAT_MAX_CHARS } from "@/lib/constants/limits";

// Én besked fra patienten (architecture 10.6). Teksten PII-maskeres i AI-laget, før den sendes eller gemmes.
export const chatMessageSchema = z
  .object({
    message: z
      .string({ message: "Skriv en besked." })
      .trim()
      .min(1, "Skriv en besked.")
      .max(CHAT_MAX_CHARS, `Beskeden må højst være ${CHAT_MAX_CHARS} tegn.`),
  })
  .strict();

// Opsummering: POST har tom body.
export const generateSummarySchema = z.object({}).strict();

// Patientens rettede og godkendte opsummering (architecture 10.5). Max 1500 tegn, som i databasen.
export const approveSummarySchema = z
  .object({
    summaryText: z
      .string({ message: "Skriv en opsummering." })
      .trim()
      .min(1, "Skriv en opsummering.")
      .max(1500, "Opsummeringen må højst være 1500 tegn."),
  })
  .strict();
