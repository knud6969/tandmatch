import { z } from "zod";
import { CHAT_MAX_CHARS } from "@/lib/constants/limits";

export const chatMessageSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Skriv en besked.")
      .max(CHAT_MAX_CHARS, `Beskeden må højst være ${CHAT_MAX_CHARS} tegn.`),
  })
  .strict();
