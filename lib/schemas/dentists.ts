import { z } from "zod";
import { COSMETIC_CATEGORIES } from "@/lib/constants/categories";

const uniqueCategories = (values: readonly string[]) => new Set(values).size === values.length;

// PATCH /api/dentists/me. Autorisations-ID og verifikation kan kun ændres af admin (architecture 4.3), så de findes ikke her.
export const patchDentistSchema = z
  .object({
    fullName: z.string().trim().min(2, "Navnet skal være mindst 2 tegn.").max(100, "Navnet må højst være 100 tegn.").optional(),
    title: z.string().trim().max(60, "Titlen må højst være 60 tegn.").nullable().optional(),
    bio: z.string().trim().max(2000, "Beskrivelsen må højst være 2000 tegn.").nullable().optional(),
    isActive: z.boolean().optional(),
    acceptsCosmetic: z.boolean().optional(),
    cosmeticCategories: z
      .array(z.enum(COSMETIC_CATEGORIES, "Ugyldig kategori."))
      .max(COSMETIC_CATEGORIES.length)
      .refine(uniqueCategories, "Kategorierne må ikke gentages.")
      .optional(),
    nextAvailableAt: z.iso.datetime({ offset: true, message: "Angiv et gyldigt tidspunkt." }).nullable().optional(),
  })
  .strict();

const TRUSTPILOT_URL = /^https:\/\/(dk|www)\.trustpilot\.com\/\S*$/;
const HTTPS_URL = /^https:\/\/\S+$/;

// PATCH /api/clinics/me. Har tandlægen ingen klinik endnu, oprettes den med name, address, postalCode og city.
export const patchClinicSchema = z
  .object({
    name: z.string().trim().min(2, "Klinikkens navn skal være mindst 2 tegn.").max(120, "Navnet må højst være 120 tegn.").optional(),
    address: z.string().trim().min(2, "Angiv adressen.").max(160, "Adressen må højst være 160 tegn.").optional(),
    postalCode: z.string().regex(/^[0-9]{4}$/, "Angiv et gyldigt postnummer.").optional(),
    city: z.string().trim().min(1, "Angiv byen.").max(80, "Byen må højst være 80 tegn.").optional(),
    phone: z.string().trim().max(30, "Telefonnummeret må højst være 30 tegn.").nullable().optional(),
    website: z
      .string()
      .trim()
      .max(200, "Adressen må højst være 200 tegn.")
      .regex(HTTPS_URL, "Hjemmesiden skal starte med https://.")
      .nullable()
      .optional(),
    trustpilotUrl: z
      .string()
      .trim()
      .max(200, "Linket må højst være 200 tegn.")
      .regex(TRUSTPILOT_URL, "Linket skal pege på dk.trustpilot.com eller www.trustpilot.com.")
      .nullable()
      .optional(),
    trustpilotScore: z
      .number()
      .min(1, "Scoren skal være mellem 1,0 og 5,0.")
      .max(5, "Scoren skal være mellem 1,0 og 5,0.")
      .refine((v) => Math.round(v * 10) === v * 10, "Scoren må kun have én decimal.")
      .nullable()
      .optional(),
    trustpilotReviewCount: z
      .number()
      .int("Antallet skal være et helt tal.")
      .min(0)
      .max(1_000_000)
      .nullable()
      .optional(),
  })
  .strict();

// GET /api/inbox?status=
export const inboxQuerySchema = z
  .object({
    status: z.enum(["new", "seen", "responded", "declined"], "Ugyldig status.").optional(),
  })
  .strict();
