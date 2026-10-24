import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import type { SlotDto } from "@/lib/clinics/types/clinics";
import { bookSlotSchema, contactNameSchema } from "@/lib/booking/schemas/bookings";
import { phoneSchema } from "@/lib/common/schemas/phone";
import { ApiRequestError } from "~/api/client";
import { dayKey, formatDayLabel } from "~/utils/format";
import { fieldErrorsFrom, type FieldErrors } from "~/utils/field-errors";

// Booking: ledige tider pr. dag, formularen og fejlhåndtering (architecture 13.4, 10.10). Reglerne er lib's skemaer.

export type SlotDay = { key: string; label: string; slots: SlotDto[] };

// Grupperer ledige tider efter dag i dansk tid, i tidsrækkefølge.
export function groupSlotsByDay(slots: SlotDto[]): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (const slot of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = dayKey(slot.startsAt);
    const day = days.get(key) ?? { key, label: formatDayLabel(slot.startsAt), slots: [] };
    day.slots.push(slot);
    days.set(key, day);
  }
  return [...days.values()];
}

export type BookingValues = { serviceId: string | null; startsAt: string | null; contactName: string; contactPhone: string };
export type BookingField = "serviceId" | "startsAt" | "contactName" | "contactPhone";
export const BOOKING_PICK_TEXT = { serviceId: "Vælg en behandling.", startsAt: "Vælg en ledig tid." } as const;

// Validerer med samme skema som serveren; navn og telefon får lib's egne fejltekster.
export function parseBooking(values: BookingValues): { ok: true; data: ReturnType<typeof bookSlotSchema.parse> } | { ok: false; errors: FieldErrors<BookingField> } {
  const parsed = bookSlotSchema.safeParse({
    serviceId: values.serviceId ?? "",
    startsAt: values.startsAt ?? "",
    contactName: values.contactName,
    contactPhone: values.contactPhone,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors = fieldErrorsFrom<BookingField>(parsed.error);
  if (!values.serviceId) errors.serviceId = BOOKING_PICK_TEXT.serviceId;
  if (!values.startsAt) errors.startsAt = BOOKING_PICK_TEXT.startsAt;
  // Navn og telefon: tomme felter får samme tekst som ugyldige.
  if (!contactNameSchema.safeParse(values.contactName).success && !errors.contactName) errors.contactName = "Angiv dit navn.";
  if (!phoneSchema.safeParse(values.contactPhone).success && !errors.contactPhone) errors.contactPhone = "Angiv et gyldigt telefonnummer.";
  return { ok: false, errors };
}

// Hvad skærmen gør efter en mislykket booking: teksten, om tiderne skal hentes igen (SLOT_TAKEN), og om den valgte tid skal fjernes.
export function bookingFailure(error: unknown): { message: string; refetchSlots: boolean; clearSlot: boolean } {
  if (error instanceof ApiRequestError) {
    return {
      message: error.message,
      refetchSlots: error.code === "SLOT_TAKEN",
      clearSlot: error.code === "SLOT_TAKEN" || error.code === "SLOT_UNAVAILABLE",
    };
  }
  return { message: "Der opstod en fejl. Prøv igen om lidt.", refetchSlots: false, clearSlot: false };
}

// Kommende: booket eller reserveret og endnu ikke slut, med den nærmeste først. Tidligere: resten, med den seneste først.
export function splitBookings(bookings: PatientBookingDto[], now: Date = new Date()): { upcoming: PatientBookingDto[]; past: PatientBookingDto[] } {
  const active = (b: PatientBookingDto) => (b.status === "booked" || b.status === "held") && new Date(b.endsAt) > now;
  return {
    upcoming: bookings.filter(active).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: bookings.filter((b) => !active(b)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  };
}
