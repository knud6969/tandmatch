import { z } from "zod";
import { firstNameSchema } from "@/lib/schemas/auth";

export const patchPatientSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    postalCode: z.string().regex(/^[0-9]{4}$/, "Angiv et gyldigt postnummer.").optional(),
  })
  .strict();

export const deleteAccountSchema = z
  .object({
    confirm: z.literal("SLET", { message: "Skriv SLET for at bekræfte." }),
  })
  .strict();
