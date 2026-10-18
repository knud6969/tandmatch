import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  BOOKING_HORIZON_DAYS,
  CLINIC_BOOKINGS_DEFAULT_PAST_DAYS,
  MAX_BOOKINGS_RANGE_DAYS,
} from "@/lib/constants/bookings";
import { DAY_MS } from "@/lib/domain/time";
import type { bookingsQuerySchema, bookSlotSchema, leadAvailabilityQuerySchema } from "@/lib/schemas/bookings";
import type { ClinicBookingDto, PatientBookingDto } from "@/lib/types/bookings";
import type { SlotDto } from "@/lib/types/clinics";
import { ApiError, clinicNotAvailable, forbidden, leadNotAccepted, serviceNotOnCase } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { AvailabilityRepository } from "@/models/availabilityRepository";
import { BookingsRepository } from "@/models/bookingsRepository";
import { ClinicDirectoryRepository } from "@/models/clinicDirectoryRepository";
import { ClinicsRepository } from "@/models/clinicsRepository";
import { LeadsRepository } from "@/models/leadsRepository";
import { ServicesRepository } from "@/models/servicesRepository";
import { AvailabilityService } from "@/services/availabilityService";

type BookSlotInput = z.infer<typeof bookSlotSchema>;
type LeadAvailabilityQuery = z.infer<typeof leadAvailabilityQuerySchema>;
type BookingsQuery = z.infer<typeof bookingsQuerySchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type BookingsDeps = {
  bookings: BookingsRepository;
  leads: LeadsRepository;
  clinics: ClinicsRepository;
  directory: ClinicDirectoryRepository;
  availability: AvailabilityRepository;
  services: ServicesRepository;
  slots: AvailabilityService;
};

// Bookinger (architecture 10.10). Én controller for ressourcen, to roller.
// Patienten: ledige tider og booking på et accepteret lead, egne bookinger og aflysning. Klinikken: kalender, aflysning og
// udeblivelse. Reglerne (accepteret lead, sagens ydelser, ledig og gyldig tid, tidsvinduer) håndhæves af book_slot(),
// cancel_booking() og mark_booking_no_show(); kontaktfelter til klinikken kommer kun fra databasen (5.5). Ledige tider
// beregnes af AvailabilityService, den samme som oversigten bruger (6.7).
export class BookingsController {
  private readonly bookings: BookingsRepository;
  private readonly leads: LeadsRepository;
  private readonly clinics: ClinicsRepository;
  private readonly directory: ClinicDirectoryRepository;
  private readonly availability: AvailabilityRepository;
  private readonly services: ServicesRepository;
  private readonly slots: AvailabilityService;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<BookingsDeps> = {},
  ) {
    this.bookings = deps.bookings ?? new BookingsRepository(supabase);
    this.leads = deps.leads ?? new LeadsRepository(supabase);
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
    this.directory = deps.directory ?? new ClinicDirectoryRepository(supabase);
    this.availability = deps.availability ?? new AvailabilityRepository(supabase);
    this.services = deps.services ?? new ServicesRepository(supabase);
    this.slots = deps.slots ?? new AvailabilityService();
  }

  // ---- Patienten ----

  // Ledige tider hos leadets klinik for en af sagens ydelser. Kun for et accepteret lead (409 LEAD_NOT_ACCEPTED); fremmed
  // lead giver 404; en ydelse uden for sagen giver 400.
  async availabilityForLead(leadId: string, query: LeadAvailabilityQuery): Promise<{ slots: SlotDto[] }> {
    const lead = await this.leads.requireBookingContext(leadId);
    if (lead.status !== "accepted") {
      throw leadNotAccepted();
    }
    if (!lead.serviceIds.includes(query.serviceId)) {
      throw serviceNotOnCase();
    }
    const [service] = await this.services.requireActive([query.serviceId]);
    const clinic = await this.directory.findClinic(lead.clinicId, [service.id]);
    if (!clinic || clinic.tier !== "full") {
      throw clinicNotAvailable();
    }
    const range = this.slots.resolveRange(query.from, query.to);
    if (!range.ok) throw new ApiError(400, "VALIDATION_ERROR", range.message);
    const { from, to } = range;
    const busy = (await this.availability.listBusyIntervals([lead.clinicId], from, to)).get(lead.clinicId) ?? [];
    return {
      slots: this.slots.slots({
        openingHours: clinic.openingHours,
        busy,
        durationMin: this.slots.durationFor(clinic.prices, [service]),
        isEmergency: service.category === "emergency",
        from,
        to,
      }),
    };
  }

  // Booker en tid på et accepteret lead (409 SLOT_TAKEN, LEAD_NOT_ACCEPTED, SLOT_UNAVAILABLE, BOOKING_LIMIT). Telefonen gemmes på patienten.
  async book(leadId: string, input: BookSlotInput): Promise<PatientBookingDto> {
    return this.bookings.requireForPatient(await this.bookings.bookSlot(leadId, input));
  }

  // ---- Begge roller ----

  // Patientens egne bookinger, eller klinikkens kalender i [from, to) (uden grænser: 7 dage tilbage og 60 dage frem).
  async list(query: BookingsQuery): Promise<PatientBookingDto[] | ClinicBookingDto[]> {
    if (this.role === "patient") return this.bookings.listForPatient();
    await this.clinics.requireOwnVerified(this.session.userId);
    const range = this.slots.resolveRange(query.from, query.to, {
      defaultFrom: new Date(Date.now() - CLINIC_BOOKINGS_DEFAULT_PAST_DAYS * DAY_MS),
      defaultDays: CLINIC_BOOKINGS_DEFAULT_PAST_DAYS + BOOKING_HORIZON_DAYS,
      maxDays: MAX_BOOKINGS_RANGE_DAYS,
    });
    if (!range.ok) throw new ApiError(400, "VALIDATION_ERROR", range.message);
    const { from, to } = range;
    return this.bookings.listForClinic(from, to);
  }

  // Aflyser egen booking før starttid (409 BOOKING_NOT_CANCELLABLE). Svaret er den opdaterede booking set fra rollen.
  async cancel(bookingId: string): Promise<PatientBookingDto | ClinicBookingDto> {
    const role = this.role;
    if (role === "clinic") await this.clinics.requireOwnVerified(this.session.userId);
    await this.bookings.cancel(bookingId); // fremmed booking giver NOT_FOUND (404)
    return role === "patient" ? this.bookings.requireForPatient(bookingId) : this.bookings.requireForClinic(bookingId);
  }

  // ---- Klinikken ----

  // Registrerer udeblivelse fra starttid til 24 timer efter sluttid (409 NO_SHOW_WINDOW_CLOSED).
  async markNoShow(bookingId: string): Promise<ClinicBookingDto> {
    await this.clinics.requireOwnVerified(this.session.userId);
    await this.bookings.markNoShow(bookingId);
    return this.bookings.requireForClinic(bookingId);
  }

  // Rollen i bookingen: kun patient og klinik (routen afviser andre via requireRole).
  private get role(): "patient" | "clinic" {
    const { role } = this.session;
    if (role !== "patient" && role !== "clinic") throw forbidden();
    return role;
  }

}
