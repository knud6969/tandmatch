import { z } from "zod";
import { MIN_PHONE_DIGITS } from "@/lib/common/constants/limits";

// Telefonnummer, delt af klinikkens profil, patientens profil og bookingens kontaktfelt. Spejler check constraints på
// clinics.phone, patients.phone og bookings.contact_phone (architecture 4.3).
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{6,20}$/, "Angiv et gyldigt telefonnummer.")
  .refine((value) => (value.match(/\d/g) ?? []).length >= MIN_PHONE_DIGITS, "Angiv et gyldigt telefonnummer.");
