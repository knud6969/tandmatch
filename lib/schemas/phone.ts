import { z } from "zod";

// Mindst så mange cifre. Databasens check (6-20 tilladte tegn) er løsere; TypeScript er strengere (security trin 6, L2),
// så "(((((("-lignende værdier ikke kan gemmes.
export const MIN_PHONE_DIGITS = 8;

// Telefonnummer, delt af klinikkens profil, patientens profil og bookingens kontaktfelt. Spejler check constraints på
// clinics.phone, patients.phone og bookings.contact_phone (architecture 4.3).
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{6,20}$/, "Angiv et gyldigt telefonnummer.")
  .refine((value) => (value.match(/\d/g) ?? []).length >= MIN_PHONE_DIGITS, "Angiv et gyldigt telefonnummer.");
