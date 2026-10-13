import { z } from "zod";
import { PORTFOLIO_CONSENT_TEXT_VERSION } from "@/lib/constants/consents";
import {
  CLINIC_DESCRIPTION_MAX_CHARS,
  CLINIC_EMAIL_MAX_CHARS,
  CLINIC_WEBSITE_MAX_CHARS,
  DENTIST_BIO_MAX_CHARS,
  DENTIST_NAME_MAX_CHARS,
  DENTIST_TITLE_MAX_CHARS,
  PORTFOLIO_CAPTION_MAX_CHARS,
  MAX_OPENING_HOUR_WINDOWS,
  MAX_PRICE_DKK,
  MAX_PRICE_ROWS,
  PRICE_NOTE_MAX_CHARS,
  SERVICE_DURATION_MAX_MINUTES,
  SERVICE_DURATION_MIN_MINUTES,
  TIME_BLOCK_NOTE_MAX_CHARS,
  TRUSTPILOT_URL_PREFIXES,
} from "@/lib/constants/clinics";

// Felter om klinikken, delt af klinik-signup (lib/schemas/auth.ts) og redigering af profilen.
// Grænserne spejler check constraints på public.clinics (architecture 4.3).
export const cvrSchema = z.string().trim().regex(/^[0-9]{8}$/, "CVR-nummeret skal være 8 cifre.");

export const clinicNameSchema = z
  .string()
  .trim()
  .min(2, "Klinikkens navn skal være mindst 2 tegn.")
  .max(100, "Klinikkens navn må højst være 100 tegn.");

export const clinicAddressSchema = z
  .string()
  .trim()
  .min(1, "Angiv adressen.")
  .max(200, "Adressen må højst være 200 tegn.");

export const postalCodeSchema = z.string().trim().regex(/^[0-9]{4}$/, "Angiv et gyldigt postnummer.");

export const clinicCitySchema = z.string().trim().min(1, "Angiv byen.").max(80, "Byen må højst være 80 tegn.");

export const clinicPhoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{6,20}$/, "Angiv et gyldigt telefonnummer.");

// ---------------------------------------------------------------------------------------------------------
// Egen klinik (architecture 10.8)

// Tom streng bliver til null, så et felt kan ryddes fra formularen.
function nullableText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((value) => (value === "" ? null : value))
    .nullable();
}

const httpUrl = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} er for langt.`)
    .refine((value) => value === "" || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(value), `Angiv et gyldigt link til ${label.toLowerCase()}.`)
    .transform((value) => (value === "" ? null : value))
    .nullable();

const trustpilotUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || TRUSTPILOT_URL_PREFIXES.some((prefix) => value.startsWith(prefix)),
    "Linket skal pege på din side hos Trustpilot (dk.trustpilot.com eller www.trustpilot.com).",
  )
  .refine((value) => value.length <= 300, "Linket er for langt.")
  .transform((value) => (value === "" ? null : value))
  .nullable();

// Alle felter er valgfri. Fra klinikkens side kan cvr, status, ejer og verificering aldrig ændres (strict).
export const patchClinicSchema = z
  .object({
    name: clinicNameSchema.optional(),
    description: nullableText(CLINIC_DESCRIPTION_MAX_CHARS, "Beskrivelsen må højst være 1000 tegn.").optional(),
    address: clinicAddressSchema.optional(),
    postalCode: postalCodeSchema.optional(),
    city: clinicCitySchema.optional(),
    phone: clinicPhoneSchema.nullable().optional(),
    email: z
      .union([z.literal("").transform(() => null), z.email("Angiv en gyldig e-mailadresse.").max(CLINIC_EMAIL_MAX_CHARS)])
      .nullable()
      .optional(),
    website: httpUrl(CLINIC_WEBSITE_MAX_CHARS, "Hjemmesiden").optional(),
    trustpilotUrl: trustpilotUrlSchema.optional(),
    trustpilotScore: z
      .number()
      .min(1, "Trustpilot-scoren skal være mellem 1,0 og 5,0.")
      .max(5, "Trustpilot-scoren skal være mellem 1,0 og 5,0.")
      .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9, "Scoren må højst have én decimal.")
      .nullable()
      .optional(),
    trustpilotReviewCount: z.number().int("Antal anmeldelser skal være et helt tal.").min(0).max(10_000_000).nullable().optional(),
  })
  .strict();

export const deleteClinicSchema = z
  .object({
    confirm: z.literal("SLET", { message: "Skriv SLET for at bekræfte." }),
  })
  .strict();

// Prisliste: erstatter hele listen (PUT).
const priceRowSchema = z
  .object({
    serviceId: z.uuid("Ugyldig ydelse."),
    priceMin: z.number().int("Prisen skal være et helt antal kroner.").min(0, "Prisen kan ikke være negativ.").max(MAX_PRICE_DKK),
    priceMax: z.number().int("Prisen skal være et helt antal kroner.").min(0, "Prisen kan ikke være negativ.").max(MAX_PRICE_DKK),
    durationMin: z
      .number()
      .int("Varigheden skal angives i hele minutter.")
      .min(SERVICE_DURATION_MIN_MINUTES, "Varigheden skal være mindst 5 minutter.")
      .max(SERVICE_DURATION_MAX_MINUTES, "Varigheden må højst være 480 minutter."),
    note: nullableText(PRICE_NOTE_MAX_CHARS, "Noten må højst være 200 tegn.").optional(),
  })
  .strict()
  .refine((row) => row.priceMax >= row.priceMin, { message: "Højeste pris skal være mindst den laveste." });

export const putPricesSchema = z
  .object({
    prices: z
      .array(priceRowSchema)
      .max(MAX_PRICE_ROWS, "For mange ydelser.")
      .refine((rows) => new Set(rows.map((row) => row.serviceId)).size === rows.length, {
        message: "Hver ydelse må kun optræde én gang.",
      }),
  })
  .strict();

// Åbningstider: erstatter hele listen (PUT). Lokal tid i Europe/Copenhagen.
const timeOfDaySchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Angiv klokkeslæt som TT:MM.");

const openingHoursRowSchema = z
  .object({
    weekday: z.number().int().min(1, "Ugedagen skal være 1-7.").max(7, "Ugedagen skal være 1-7."),
    opensAt: timeOfDaySchema,
    closesAt: timeOfDaySchema,
    isEmergency: z.boolean(),
  })
  .strict()
  .refine((row) => row.opensAt < row.closesAt, { message: "Åbningstiden skal ligge før lukketiden." });

export const putOpeningHoursSchema = z
  .object({
    hours: z
      .array(openingHoursRowSchema)
      .max(MAX_OPENING_HOUR_WINDOWS, "For mange åbningstider.")
      .superRefine((rows, ctx) => {
        // Samme regel som triggeren clinic_opening_hours_guard(): vinduer samme dag må ikke overlappe.
        for (let i = 0; i < rows.length; i++) {
          for (let j = i + 1; j < rows.length; j++) {
            const a = rows[i];
            const b = rows[j];
            if (a.weekday === b.weekday && a.opensAt < b.closesAt && b.opensAt < a.closesAt) {
              ctx.addIssue({ code: "custom", message: "Åbningstider på samme dag må ikke overlappe." });
              return;
            }
          }
        }
      }),
  })
  .strict();

// Blokeringer (lukket, ferie, fuldt booket via eget system).
const isoDateTime = z.iso.datetime({ offset: true, message: "Angiv et gyldigt tidspunkt." });

export const createTimeBlockSchema = z
  .object({
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    note: nullableText(TIME_BLOCK_NOTE_MAX_CHARS, "Noten må højst være 200 tegn.").optional(),
  })
  .strict()
  .refine((block) => Date.parse(block.startsAt) < Date.parse(block.endsAt), {
    message: "Starten skal ligge før slutningen.",
  });

export const timeBlocksQuerySchema = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------------------
// Tandlæger og portefølje (architecture 10.8)

const dentistFields = {
  fullName: z
    .string()
    .trim()
    .min(1, "Angiv tandlægens navn.")
    .max(DENTIST_NAME_MAX_CHARS, "Navnet må højst være 100 tegn."),
  title: nullableText(DENTIST_TITLE_MAX_CHARS, "Titlen må højst være 100 tegn."),
  bio: nullableText(DENTIST_BIO_MAX_CHARS, "Beskrivelsen må højst være 1000 tegn."),
  sortOrder: z.number().int("Rækkefølgen skal være et helt tal.").min(0).max(1000),
};

export const createDentistSchema = z
  .object({
    fullName: dentistFields.fullName,
    title: dentistFields.title.optional(),
    bio: dentistFields.bio.optional(),
    sortOrder: dentistFields.sortOrder.optional(),
  })
  .strict();

export const patchDentistSchema = z
  .object({
    fullName: dentistFields.fullName.optional(),
    title: dentistFields.title.optional(),
    bio: dentistFields.bio.optional(),
    sortOrder: dentistFields.sortOrder.optional(),
  })
  .strict();

// Tomme formularfelter (multipart) tolkes som "ikke angivet".
const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

// Felterne i POST /api/clinics/me/portfolio (multipart). Uden bekræftelsen afvises uploadet (architecture 9.5).
export const createPortfolioItemSchema = z
  .object({
    dentistId: z.uuid("Vælg en tandlæge."),
    serviceId: z.preprocess(emptyAsUndefined, z.uuid("Ugyldig ydelse.").optional()),
    caption: z.preprocess(emptyAsUndefined, nullableText(PORTFOLIO_CAPTION_MAX_CHARS, "Billedteksten må højst være 200 tegn.").optional()),
    patientConsentConfirmed: z.literal("true", {
      message: "Bekræft, at patienten har givet samtykke til, at billedet vises offentligt.",
    }),
    consentTextVersion: z.literal(PORTFOLIO_CONSENT_TEXT_VERSION, {
      message: "Bekræftelsesteksten er opdateret. Læs den igen og bekræft.",
    }),
  })
  .strict();

export const patchPortfolioItemSchema = z
  .object({
    caption: nullableText(PORTFOLIO_CAPTION_MAX_CHARS, "Billedteksten må højst være 200 tegn.").optional(),
    serviceId: z.uuid("Ugyldig ydelse.").nullable().optional(),
  })
  .strict();
