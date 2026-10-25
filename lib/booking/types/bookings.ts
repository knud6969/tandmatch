import type { BOOKING_STATUSES } from "@/lib/booking/constants/bookings";

// Bookinger (architecture 4.3, 10.10).
export type BookingStatus = (typeof BOOKING_STATUSES)[number]; // altid effektiv status (4.2)

// Hvem der aflyste en booking. "system": en reservation, der udløb (cancelled_by = null i databasen).
export type BookingCanceller = "patient" | "clinic" | "system";

// Patientens visning af en booking. Klinikken kommer fra patient_bookings() (patienten har ingen SELECT på clinics).
export type PatientBookingDto = {
  id: string;
  leadId: string;
  clinic: { id: string; name: string; address: string; city: string };
  service: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  canCancel: boolean; // booked og før starttid
  canReview: boolean; // effektivt completed (ends_at + 24 t) og ikke anmeldt endnu
  holdExpiresAt: string | null; // kun held (akut)
  cancelledBy: BookingCanceller | null; // kun cancelled
  cancelReason: string | null; // klinikkens grund, kun når klinikken aflyste og skrev en
};

// Klinikkens visning af en booking. `contact` er kun udfyldt for booked/completed (architecture 5.5), aldrig for held.
export type ClinicBookingDto = {
  id: string;
  leadId: string;
  service: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  contact: { name: string; phone: string; email: string } | null;
  canMarkNoShow: boolean; // starts_at <= nu < ends_at + 24 t
  canCancel: boolean; // booked og før starttid
  holdExpiresAt: string | null; // kun held
  cancelledBy: BookingCanceller | null; // kun cancelled. Ingen patientdata
  cancelReason: string | null; // klinikkens egen grund, kun cancelled af klinikken
};

// Booking i dataeksporten (GDPR art. 15/20): patientens egne bookinger, med de kontaktoplysninger patienten selv har angivet.
export type BookingExportDto = {
  id: string;
  leadId: string;
  clinicId: string;
  clinicName: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  cancelledBy: "patient" | "clinic" | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  completedAt: string | null;
};
