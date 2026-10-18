import "server-only";
import type { z } from "zod";
import { canCancel, canMarkNoShow, canReview, pickLeadBooking } from "@/lib/domain/bookings";
import type { bookSlotSchema } from "@/lib/schemas/bookings";
import type { BookingExportDto, BookingStatus, ClinicBookingDto, PatientBookingDto } from "@/lib/types/bookings";
import { ACCOUNT_REQUIRED_MESSAGES, accountRequired, ApiError, notFound } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Database } from "@/models/db/database.types";

type BookSlotInput = z.infer<typeof bookSlotSchema>;
type Functions = Database["public"]["Functions"];

// Rækker fra patient_bookings() og clinic_bookings()/clinic_booking() (architecture 5.3, 5.7). De genererede typer markerer
// ikke nullable kolonner; formen angives her.
type PatientBookingRow = Functions["patient_bookings"]["Returns"][number] & { hold_expires_at: string | null };
type ClinicBookingRow = Omit<
  Functions["clinic_booking"]["Returns"][number],
  "hold_expires_at" | "contact_name" | "contact_phone" | "contact_email"
> & {
  hold_expires_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

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

// Tabelrække til dataeksporten (RLS: patientens egne bookinger).
type BookingExportRow = {
  id: string;
  lead_id: string;
  starts_at: string;
  ends_at: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  cancelled_by: "patient" | "clinic" | null;
  cancelled_at: string | null;
  no_show_at: string | null;
  completed_at: string | null;
};

// Tidspunkter fra databasen ("…+00:00") normaliseres til ISO med Z, som SlotDto (så startsAt kan sammenlignes direkte).
const iso = (value: string) => new Date(value).toISOString();
const isoOrNull = (value: string | null) => (value === null ? null : iso(value));

const booking = (code: string, message: string) => new ApiError(409, code, message);

// Fejl fra book_slot() (architecture 5.3, 10.10). Teksterne står kun her.
const BOOK_ERRORS = (): Record<string, ApiError> => ({
  ACCOUNT_REQUIRED: accountRequired(ACCOUNT_REQUIRED_MESSAGES.bookSlot),
  NOT_FOUND: notFound(),
  LEAD_NOT_ACCEPTED: booking("LEAD_NOT_ACCEPTED", "Klinikken har ikke accepteret din henvendelse, eller der er allerede en tid."),
  // Samtidige bookinger på samme lead rammer det delvise unikke indeks.
  bookings_one_active_per_lead: booking("LEAD_NOT_ACCEPTED", "Klinikken har ikke accepteret din henvendelse, eller der er allerede en tid."),
  CLINIC_NOT_AVAILABLE: booking("CLINIC_NOT_AVAILABLE", "Klinikken kan ikke modtage bookinger lige nu."),
  SLOT_TAKEN: booking("SLOT_TAKEN", "Tiden er desværre taget. Vælg en anden tid."),
  SLOT_UNAVAILABLE: booking("SLOT_UNAVAILABLE", "Tiden kan ikke bookes. Vælg en anden tid."),
  INVALID_SERVICE: new ApiError(400, "VALIDATION_ERROR", "Vælg en af behandlingerne på din sag."),
  INVALID_CONTACT: new ApiError(400, "VALIDATION_ERROR", "Tjek navn og telefonnummer."),
});

const CANCEL_ERRORS = (): Record<string, ApiError> => ({
  NOT_FOUND: notFound(),
  BOOKING_NOT_CANCELLABLE: booking("BOOKING_NOT_CANCELLABLE", "Tiden kan ikke aflyses her, fordi den er begyndt eller ikke længere er booket."),
});

const NO_SHOW_ERRORS = (): Record<string, ApiError> => ({
  NOT_FOUND: notFound(),
  NO_SHOW_WINDOW_CLOSED: booking("NO_SHOW_WINDOW_CLOSED", "Udeblivelse kan kun registreres fra starttid til 24 timer efter sluttid."),
});

const EXPORT_COLUMNS =
  "id, lead_id, starts_at, ends_at, contact_name, contact_phone, contact_email, cancelled_by, cancelled_at, no_show_at, completed_at";

// Bookinger (architecture 4.3, 5.3, 10.10). Brugerens JWT, så RLS og funktionerne afgør adgangen: patienten læser sine
// egne bookinger gennem patient_bookings() (klinikkens navn og adresse), klinikken gennem clinic_bookings() og clinic_booking(),
// som kun giver kontaktfelter for booked/completed (5.5). Oprettelse, aflysning og udeblivelse sker kun gennem book_slot(),
// cancel_booking() og mark_booking_no_show(), som tjekker ejerskab. complete_due_bookings() kaldes med service role-klienten
// (cron). Rækkerne mappes direkte til DTO'erne, så toDto() i basisklassen ikke bruges.
export class BookingsRepository extends BaseRepository {
  // ---- Mapping ----

  private toPatientDto(row: PatientBookingRow, now: Date): PatientBookingDto {
    return {
      id: row.booking_id,
      leadId: row.lead_id,
      clinic: { id: row.clinic_id, name: row.clinic_name, address: row.clinic_address, city: row.clinic_city },
      service: { id: row.service_id, name: row.service_name },
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      status: row.status,
      canCancel: canCancel(row.status, row.starts_at, now),
      canReview: canReview(row.status, row.ends_at, row.reviewed, now),
      holdExpiresAt: isoOrNull(row.hold_expires_at),
    };
  }

  // Klinikkens booking. Kontaktfelterne mappes, som databasen giver dem (kun booked/completed, 5.5); her tilføjes ingen regel.
  static toClinicDto(fields: ClinicBookingFields, now: Date = new Date()): ClinicBookingDto {
    return {
      id: fields.id,
      leadId: fields.leadId,
      service: { id: fields.serviceId, name: fields.serviceName },
      startsAt: iso(fields.startsAt),
      endsAt: iso(fields.endsAt),
      status: fields.status,
      contact:
        fields.contactName !== null && fields.contactPhone !== null && fields.contactEmail !== null
          ? { name: fields.contactName, phone: fields.contactPhone, email: fields.contactEmail }
          : null,
      canMarkNoShow: canMarkNoShow(fields.status, fields.startsAt, fields.endsAt, now),
      canCancel: canCancel(fields.status, fields.startsAt, now),
      holdExpiresAt: isoOrNull(fields.holdExpiresAt),
    };
  }

  private clinicRowToDto(row: ClinicBookingRow): ClinicBookingDto {
    return BookingsRepository.toClinicDto({
      id: row.booking_id,
      leadId: row.lead_id,
      serviceId: row.service_id,
      serviceName: row.service_name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      holdExpiresAt: row.hold_expires_at,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
    });
  }

  // ---- Patienten ----

  private async patientRows(bookingId?: string): Promise<PatientBookingRow[]> {
    return (await this.rpc<PatientBookingRow[]>("patient_bookings", bookingId ? { p_booking_id: bookingId } : {})) ?? [];
  }

  // Patientens bookinger, nyeste starttid først.
  async listForPatient(): Promise<PatientBookingDto[]> {
    const now = new Date();
    return (await this.patientRows()).map((row) => this.toPatientDto(row, now));
  }

  // Egen booking (andres giver 404).
  async requireForPatient(bookingId: string): Promise<PatientBookingDto> {
    return this.toPatientDto(this.requireRow((await this.patientRows(bookingId))[0]), new Date());
  }

  // Den booking hvert af patientens leads viser (aktiv, ellers den nyeste), pr. lead-id.
  async currentByLead(): Promise<Map<string, PatientBookingDto>> {
    const now = new Date();
    const byLead = new Map<string, PatientBookingRow[]>();
    for (const row of await this.patientRows()) byLead.set(row.lead_id, [...(byLead.get(row.lead_id) ?? []), row]);
    const result = new Map<string, PatientBookingDto>();
    for (const [leadId, rows] of byLead) {
      const current = pickLeadBooking(rows.map((row) => ({ row, status: row.status, createdAt: row.created_at })));
      if (current) result.set(leadId, this.toPatientDto(current.row, now));
    }
    return result;
  }

  // book_slot(): leadet skal være accepteret, ydelsen en af sagens, tiden gyldig og ledig. Returnerer bookingens id.
  async bookSlot(leadId: string, input: BookSlotInput): Promise<string> {
    const id = await this.rpc<string>(
      "book_slot",
      {
        p_lead_id: leadId,
        p_service_id: input.serviceId,
        p_starts_at: input.startsAt,
        p_contact_name: input.contactName,
        p_contact_phone: input.contactPhone,
      },
      BOOK_ERRORS(),
    );
    return this.requireRow(id);
  }

  // Alle patientens bookinger til dataeksporten: tabellen (kontaktfelter) med klinik- og ydelsesnavn og effektiv status.
  async listOwnForExport(): Promise<BookingExportDto[]> {
    const [rows, names] = await Promise.all([
      this.runList<BookingExportRow>(
        this.db.from("bookings").select(EXPORT_COLUMNS).order("starts_at", { ascending: true }),
        "bookings: eksport fejlede",
      ),
      this.patientRows(),
    ]);
    const byId = new Map(names.map((row) => [row.booking_id, row]));
    return rows.flatMap((row) => {
      const info = byId.get(row.id);
      if (!info) return [];
      return [
        {
          id: row.id,
          leadId: row.lead_id,
          clinicId: info.clinic_id,
          clinicName: info.clinic_name,
          serviceName: info.service_name,
          startsAt: iso(row.starts_at),
          endsAt: iso(row.ends_at),
          status: info.status,
          contactName: row.contact_name,
          contactPhone: row.contact_phone,
          contactEmail: row.contact_email,
          cancelledBy: row.cancelled_by,
          cancelledAt: row.cancelled_at,
          noShowAt: row.no_show_at,
          completedAt: row.completed_at,
        },
      ];
    });
  }

  // ---- Klinikken ----

  // Klinikkens kalender i [from, to). Tom liste for en klinik, der ikke er verificeret.
  async listForClinic(from: Date, to: Date): Promise<ClinicBookingDto[]> {
    const rows = await this.rpc<ClinicBookingRow[]>("clinic_bookings", { p_from: from.toISOString(), p_to: to.toISOString() });
    return (rows ?? []).map((row) => this.clinicRowToDto(row));
  }

  // Klinikkens egen booking (andres giver 404).
  async requireForClinic(bookingId: string): Promise<ClinicBookingDto> {
    const rows = await this.rpc<ClinicBookingRow[]>("clinic_booking", { p_booking_id: bookingId });
    return this.clinicRowToDto(this.requireRow(rows?.[0]));
  }

  // ---- Begge ----

  // cancel_booking(): patienten (ejer) eller klinikken (verificeret ejer), kun booked og før starttid.
  async cancel(bookingId: string): Promise<void> {
    await this.rpc("cancel_booking", { p_booking_id: bookingId }, CANCEL_ERRORS());
  }

  // mark_booking_no_show(): klinikken, fra starttid til 24 timer efter sluttid.
  async markNoShow(bookingId: string): Promise<void> {
    await this.rpc("mark_booking_no_show", { p_booking_id: bookingId }, NO_SHOW_ERRORS());
  }

  // ---- Cron (kun med service role-klienten) ----

  // complete_due_bookings(): skriver den effektive status ned og frigiver udløbne reservationer.
  async completeDue(): Promise<{ completed: number; releasedHolds: number }> {
    const rows = await this.rpc<{ completed: number; released_holds: number }[]>("complete_due_bookings", undefined);
    const row = rows?.[0];
    return { completed: row?.completed ?? 0, releasedHolds: row?.released_holds ?? 0 };
  }
}
