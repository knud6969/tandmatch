import { z } from "zod";

// Telefonnummer, delt af klinikkens profil, patientens profil og bookingens kontaktfelt. Spejler check constraints på
// clinics.phone, patients.phone og bookings.contact_phone (architecture 4.3).
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{6,20}$/, "Angiv et gyldigt telefonnummer.");
