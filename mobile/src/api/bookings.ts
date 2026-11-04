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

// Patienten aflyser en booking før starttid (409 BOOKING_NOT_CANCELLABLE).
export function cancelBooking(bookingId: string): Promise<PatientBookingDto> {
  return apiRequest<PatientBookingDto>(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: "POST", json: {} });
}

// Ledige tider til at flytte en booket tid: samme klinik og behandling som bookingen (booking 10.16; højst 14 dage).
export async function getBookingAvailability(bookingId: string): Promise<SlotDto[]> {
  const result = await apiRequest<{ slots: SlotDto[] }>(`/api/bookings/${encodeURIComponent(bookingId)}/availability`);
  return result.slots;
}

// Flytter en booket tid. Svaret er den nye booking (nyt id). 409 SLOT_TAKEN, SLOT_UNAVAILABLE, BOOKING_NOT_RESCHEDULABLE m.fl.
export function rescheduleBooking(bookingId: string, startsAt: string): Promise<PatientBookingDto> {
  return apiRequest<PatientBookingDto>(`/api/bookings/${encodeURIComponent(bookingId)}/reschedule`, { method: "POST", json: { startsAt } });
}
