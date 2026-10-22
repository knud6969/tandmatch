import { canCancel, canMarkNoShow } from "@/lib/domain/bookings";
import type { BookingStatus, ClinicBookingDto } from "@/lib/types/bookings";
import type { TrustpilotInfo } from "@/lib/common/types/common";

// Trustpilot-kolonnerne som de står på clinics og i public_*-funktionerne (architecture 4.3, 8.4). Delt af
// ClinicsRepository og ClinicDirectoryRepository, så mappingen kun findes ét sted.
export type TrustpilotColumns = {
  trustpilot_url: string | null;
  trustpilot_score: number | null;
  trustpilot_review_count: number | null;
  trustpilot_updated_at: string | null;
  trustpilot_entered_by: string | null;
};

export function trustpilotFromColumns(row: TrustpilotColumns): TrustpilotInfo {
  if (!row.trustpilot_url) return null;
  return {
    url: row.trustpilot_url,
    score: row.trustpilot_score,
    reviewCount: row.trustpilot_review_count,
    updatedAt: row.trustpilot_updated_at,
    enteredBy: row.trustpilot_entered_by === "admin" ? "admin" : "clinic",
  };
}

// Tidspunkter fra databasen ("…+00:00") normaliseres til ISO med Z, så de kan sammenlignes direkte (fx med SlotDto).
export const iso = (value: string) => new Date(value).toISOString();
export const isoOrNull = (value: string | null) => (value === null ? null : iso(value));

// Typer fra `returns table` markerer ikke nullable kolonner; de angives her ét sted.
export type WithNulls<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

// Felterne bag ClinicBookingDto, uanset om de kommer fra clinic_bookings(), clinic_booking() eller clinic_lead_detail().
export type ClinicBookingFields = {
  id: string;
  leadId: string;
  serviceId: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  holdExpiresAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

// Klinikkens booking. Kontaktfelterne følger databasens regel (kun booked/completed, architecture 5.5); mapperen
// gentager den som sikkerhedsnet (security trin 6, L1), så en held-booking aldrig får `contact`, selv om rækken har felterne.
export function toClinicBookingDto(fields: ClinicBookingFields, now: Date = new Date()): ClinicBookingDto {
  const showContact = fields.status === "booked" || fields.status === "completed";
  return {
    id: fields.id,
    leadId: fields.leadId,
    service: { id: fields.serviceId, name: fields.serviceName },
    startsAt: iso(fields.startsAt),
    endsAt: iso(fields.endsAt),
    status: fields.status,
    contact:
      showContact && fields.contactName !== null && fields.contactPhone !== null && fields.contactEmail !== null
        ? { name: fields.contactName, phone: fields.contactPhone, email: fields.contactEmail }
        : null,
    canMarkNoShow: canMarkNoShow(fields.status, fields.startsAt, fields.endsAt, now),
    canCancel: canCancel(fields.status, fields.startsAt, now),
    holdExpiresAt: isoOrNull(fields.holdExpiresAt),
  };
}
