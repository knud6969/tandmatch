import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Angiv en gyldig e-mailadresse.").max(254, "E-mailadressen er for lang."));

export const passwordSchema = z
  .string()
  .min(8, "Adgangskoden skal være mindst 8 tegn.")
  .max(72, "Adgangskoden må højst være 72 tegn.");

export const firstNameSchema = z
  .string()
  .trim()
  .min(1, "Angiv dit fornavn.")
  .max(50, "Fornavnet må højst være 50 tegn.");

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, "Angiv din adgangskode.").max(72),
  })
  .strict();

export const signupSchema = z.discriminatedUnion("role", [  // Klinik-signup kommer i 1.1.
  z
    .object({
      role: z.literal("patient"),
      email: emailSchema,
      password: passwordSchema,
      firstName: firstNameSchema,
    })
    .strict(),
]);

export const convertSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    firstName: firstNameSchema,
  })
  .strict();
