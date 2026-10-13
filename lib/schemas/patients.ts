import { z } from "zod";
import { firstNameSchema } from "@/lib/schemas/auth";
import { postalCodeSchema } from "@/lib/schemas/clinics";

export const patchPatientSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    postalCode: postalCodeSchema.optional(),
  })
  .strict();

export const deleteAccountSchema = z
  .object({
    confirm: z.literal("SLET", { message: "Skriv SLET for at bekræfte." }),
  })
  .strict();
