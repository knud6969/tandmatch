import { z } from "zod";
import { MESSAGE_MAX_CHARS } from "@/lib/constants/limits";

export const createMessageSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, "Skriv en besked.")
      .max(MESSAGE_MAX_CHARS, `Beskeden må højst være ${MESSAGE_MAX_CHARS} tegn.`),
  })
  .strict();
