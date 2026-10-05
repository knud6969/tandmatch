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

export const signupSchema = z.discriminatedUnion("role", [
  z
    .object({
      role: z.literal("patient"),
      email: emailSchema,
      password: passwordSchema,
      firstName: firstNameSchema,
    })
    .strict(),
  z
    .object({
      role: z.literal("dentist"),
      email: emailSchema,
      password: passwordSchema,
      fullName: z.string().trim().min(2, "Angiv dit fulde navn.").max(100),
      authorizationId: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9-]{3,20}$/, "Autorisations-ID har et ugyldigt format."),
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
