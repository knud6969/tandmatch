import { z } from "zod";
import { PORTFOLIO_CONSENT_TEXT_VERSION } from "@/lib/constants/consents";
import {
  CLINIC_DESCRIPTION_MAX_CHARS,
  CLINIC_SORTS,
  MAX_SELECTED_SERVICES,
  CLINIC_EMAIL_MAX_CHARS,
  CLINIC_WEBSITE_MAX_CHARS,
  DENTIST_BIO_MAX_CHARS,
  DENTIST_NAME_MAX_CHARS,
  DENTIST_TITLE_MAX_CHARS,
  PORTFOLIO_CAPTION_MAX_CHARS,
  MAX_OPENING_HOUR_WINDOWS,
  MAX_PRICE_DKK,
  MAX_PRICE_ROWS,
  MAX_SERVICE_GROUPS,
  PRICE_NOTE_MAX_CHARS,
  SERVICE_DURATION_MAX_MINUTES,
  SERVICE_DURATION_MIN_MINUTES,
  TIME_BLOCK_NOTE_MAX_CHARS,
  TRUSTPILOT_URL_PREFIXES,
  WEEKDAYS,
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

export type NewClinicPrice = z.infer<typeof priceRowSchema>;

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

// Valgte kategorier: erstatter hele valget (PUT, architecture 10.8).
export const putServiceGroupsSchema = z
  .object({
    groupIds: z
      .array(z.uuid("Ugyldig kategori."))
      .max(MAX_SERVICE_GROUPS, "For mange kategorier.")
      .refine((ids) => new Set(ids).size === ids.length, { message: "Hver kategori må kun optræde én gang." }),
  })
  .strict();

// Åbningstider: erstatter hele listen (PUT). Lokal tid i Europe/Copenhagen.
const timeOfDaySchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Angiv klokkeslæt som TT:MM.");

const openingHoursRowSchema = z
  .object({
    weekday: z.literal(WEEKDAYS, "Ugedagen skal være 1-7."),
    opensAt: timeOfDaySchema,
    closesAt: timeOfDaySchema,
    isEmergency: z.boolean(),
  })
  .strict()
  .refine((row) => row.opensAt < row.closesAt, { message: "Åbningstiden skal ligge før lukketiden." });

export type NewOpeningHours = z.infer<typeof openingHoursRowSchema>;

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

export type NewTimeBlock = z.infer<typeof createTimeBlockSchema>;

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

// ---------------------------------------------------------------------------------------------------------
// Offentlig oversigt og profil (architecture 10.7). Query-parametre er altid tekst.

const emptyQueryAsUndefined = (value: unknown) => (value === "" ? undefined : value);

// `?services=slug,slug`: kommaseparerede slugs fra kataloget.
const servicesParamSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.split(",").map((slug) => slug.trim()).filter((slug) => slug !== "") : value),
  z
    .array(z.string().regex(/^[a-z0-9_]{1,60}$/, "Ukendt behandling."))
    .max(MAX_SELECTED_SERVICES, `Vælg højst ${MAX_SELECTED_SERVICES} behandlinger.`)
    .transform((slugs) => [...new Set(slugs)]),
);

const queryNumber = (min: number, max: number, message: string) =>
  z.preprocess(emptyQueryAsUndefined, z.coerce.number(message).min(min, message).max(max, message));

const queryBoolean = z.preprocess(emptyQueryAsUndefined, z.enum(["true", "false"], { message: "Angiv true eller false." }).transform((v) => v === "true"));

export const clinicsQuerySchema = z
  .object({
    services: servicesParamSchema.optional(),
    postalCode: z.preprocess(emptyQueryAsUndefined, postalCodeSchema).optional(),
    lat: queryNumber(-90, 90, "Ugyldig position.").optional(),
    lng: queryNumber(-180, 180, "Ugyldig position.").optional(),
    maxDistanceKm: queryNumber(0, 20_000, "Ugyldig afstand.").optional(),
    maxPrice: queryNumber(0, MAX_PRICE_DKK, "Ugyldig pris.").optional(),
    minStars: queryNumber(1, 5, "Antal stjerner skal være mellem 1 og 5.").optional(),
    emergency: queryBoolean.optional(),
    contactableOnly: queryBoolean.optional(),
    sort: z.preprocess(emptyQueryAsUndefined, z.enum(CLINIC_SORTS, { message: "Ukendt sortering." })).optional(),
  })
  .strict()
  .refine((query) => (query.lat === undefined) === (query.lng === undefined), { message: "Angiv både lat og lng." })
  .refine((query) => query.maxPrice === undefined || (query.services?.length ?? 0) > 0, {
    message: "Vælg mindst én behandling for at filtrere på pris.",
  });

export const clinicProfileQuerySchema = z.object({ services: servicesParamSchema.optional() }).strict();

export const availabilityQuerySchema = z
  .object({
    serviceId: z.uuid("Ugyldig behandling."),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------------------
// jsonb-kolonner fra public_clinics()/public_clinic_profile() (architecture 2.1.1: jsonb parses med zod).

export const publicOpeningHoursJsonSchema = z.array(
  z.object({
    weekday: z.literal(WEEKDAYS),
    opens_at: z.string(),
    closes_at: z.string(),
    is_emergency: z.boolean(),
  }),
);

export const publicPricesJsonSchema = z.array(
  z.object({
    service_id: z.uuid(),
    service_slug: z.string(),
    service_name: z.string(),
    price_min: z.number(),
    price_max: z.number(),
    duration_min: z.number(),
    note: z.string().nullable(),
  }),
);

export const publicDentistsJsonSchema = z.array(
  z.object({
    id: z.uuid(),
    full_name: z.string(),
    title: z.string().nullable(),
    bio: z.string().nullable(),
    photo_path: z.string().nullable(),
    photo_updated_at: z.string().nullable(),
    portfolio: z.array(
      z.object({
        id: z.uuid(),
        image_path: z.string(),
        caption: z.string().nullable(),
        service_name: z.string().nullable(),
      }),
    ),
  }),
);
