import type { z } from "zod";
import type { bookSlotSchema } from "@/lib/booking/schemas/bookings";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import type { SlotDto } from "@/lib/clinics/types/clinics";
import { apiRequest } from "./client";

// Booking (architecture 10.10). Fejlkoderne SLOT_TAKEN, SLOT_UNAVAILABLE, BOOKING_LIMIT m.fl. kommer som ApiRequestError med dansk tekst.

// Ledige tider hos leadets klinik for en af sagens behandlinger (højst 14 dage; uden from/to de næste 14 dage).
export async function getLeadAvailability(leadId: string, serviceId: string): Promise<SlotDto[]> {
  const result = await apiRequest<{ slots: SlotDto[] }>(`/api/leads/${encodeURIComponent(leadId)}/availability?serviceId=${encodeURIComponent(serviceId)}`);
  return result.slots;
}

export function bookSlot(leadId: string, input: z.infer<typeof bookSlotSchema>): Promise<PatientBookingDto> {
  return apiRequest<PatientBookingDto>(`/api/leads/${encodeURIComponent(leadId)}/booking`, { method: "POST", json: input });
}

// Patientens egne bookinger.
export async function listBookings(): Promise<PatientBookingDto[]> {
  const result = await apiRequest<{ bookings: PatientBookingDto[] }>("/api/bookings");
  return result.bookings;
}
