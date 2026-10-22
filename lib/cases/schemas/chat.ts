import { z } from "zod";
import { CHAT_MAX_CHARS, SUMMARY_MAX_CHARS } from "@/lib/common/constants/limits";

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

// Patientens rettede og godkendte opsummering (architecture 10.5). Max SUMMARY_MAX_CHARS tegn, som i databasen.
export const approveSummarySchema = z
  .object({
    summaryText: z
      .string({ message: "Skriv en opsummering." })
      .trim()
      .min(1, "Skriv en opsummering.")
      .max(SUMMARY_MAX_CHARS, `Opsummeringen må højst være ${SUMMARY_MAX_CHARS} tegn.`),
  })
  .strict();
