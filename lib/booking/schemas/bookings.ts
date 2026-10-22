import { z } from "zod";
import { CONTACT_NAME_MAX_CHARS, CONTACT_NAME_MIN_CHARS } from "@/lib/booking/constants/bookings";
import { phoneSchema } from "@/lib/common/schemas/phone";

const isoDateTime = z.iso.datetime({ offset: true, message: "Angiv et gyldigt tidspunkt." });

// Kontaktnavn ved booking (og ved akut-lead, architecture 10.11).
export const contactNameSchema = z
  .string()
  .trim()
  .min(CONTACT_NAME_MIN_CHARS, `Navnet skal være mindst ${CONTACT_NAME_MIN_CHARS} tegn.`)
  .max(CONTACT_NAME_MAX_CHARS, `Navnet må højst være ${CONTACT_NAME_MAX_CHARS} tegn.`);

// POST /api/leads/{id}/booking (architecture 10.10).
export const bookSlotSchema = z
  .object({
    serviceId: z.uuid("Ugyldig behandling."),
    startsAt: isoDateTime,
    contactName: contactNameSchema,
    contactPhone: phoneSchema,
  })
  .strict();

// GET /api/leads/{id}/availability?serviceId=&from=&to= (samme form som GET /api/clinics/{id}/availability).
export const leadAvailabilityQuerySchema = z
  .object({ serviceId: z.uuid("Ugyldig behandling."), from: isoDateTime.optional(), to: isoDateTime.optional() })
  .strict();

// GET /api/bookings?from=&to= (klinikkens kalender).
export const bookingsQuerySchema = z
  .object({ from: isoDateTime.optional(), to: isoDateTime.optional() })
  .strict();

// POST .../cancel og .../no-show har tom body.
export const emptyBookingActionSchema = z.object({}).strict();
