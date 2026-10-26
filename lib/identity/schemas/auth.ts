import { z } from "zod";
import {
  clinicAddressSchema,
  clinicCitySchema,
  clinicNameSchema,
  cvrSchema,
  postalCodeSchema,
} from "@/lib/clinics/schemas/clinics";
import { phoneSchema } from "@/lib/common/schemas/phone";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Angiv en gyldig e-mailadresse.").max(254, "E-mailadressen er for lang."));

const passwordSchema = z
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
      role: z.literal("clinic"),
      email: emailSchema,
      password: passwordSchema,
      cvr: cvrSchema,
      clinicName: clinicNameSchema,
      address: clinicAddressSchema,
      postalCode: postalCodeSchema,
      city: clinicCitySchema,
      phone: phoneSchema,
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

// Bekræftelse af kontosletning (patient og klinik): DELETE /api/patients/me og /api/clinics/me.
export const deleteAccountSchema = z
  .object({
    confirm: z.literal("SLET", { message: "Skriv SLET for at bekræfte." }),
  })
  .strict();

// Fornyelse af appens session: POST /api/auth/refresh. Refresh-tokenet sendes kun i bodyen (architecture 10.2).
export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, "Angiv refresh-token.").max(512),
  })
  .strict();

// Glemt adgangskode: POST /api/auth/password/forgot. Strict: redirect-URL'en bygges kun af serveren (architecture 10.2).
export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

// Koden fra e-maillinket: `code` (PKCE, Supabase' standardskabelon) eller `tokenHash` (skabelon med token_hash).
const recoveryCodeSchema = z.string().trim().min(8, "Linket er ufuldstændigt.").max(512, "Linket er ugyldigt.");
export const passwordRecoverySchema = z.union([
  z.object({ code: recoveryCodeSchema }).strict(),
  z.object({ tokenHash: recoveryCodeSchema }).strict(),
]);

// Ny adgangskode efter et recovery-link: POST /api/auth/password/reset. Samme krav som ved oprettelse.
export const resetPasswordSchema = z.object({ password: passwordSchema }).strict();

const currentPasswordSchema = z.string().min(1, "Angiv din nuværende adgangskode.").max(72);

// Skift login-e-mail: POST /api/auth/account/email.
export const changeEmailSchema = z.object({ email: emailSchema, currentPassword: currentPasswordSchema }).strict();

// Skift adgangskode: POST /api/auth/account/password.
export const changePasswordSchema = z
  .object({ currentPassword: currentPasswordSchema, newPassword: passwordSchema })
  .strict();
