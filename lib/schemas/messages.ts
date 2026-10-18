import { z } from "zod";
import { MESSAGE_MAX_CHARS } from "@/lib/constants/limits";

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
