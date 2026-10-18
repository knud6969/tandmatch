import { z } from "zod";
import { firstNameSchema } from "@/lib/schemas/auth";
import { postalCodeSchema } from "@/lib/schemas/clinics";
import { phoneSchema } from "@/lib/schemas/phone";

export const patchPatientSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    postalCode: postalCodeSchema.optional(),
    phone: phoneSchema.nullable().optional(), // null rydder nummeret
  })
  .strict();

export const deleteAccountSchema = z
  .object({
    confirm: z.literal("SLET", { message: "Skriv SLET for at bekræfte." }),
  })
  .strict();
