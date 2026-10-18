import "server-only";
import type { z } from "zod";
import { isActiveLead } from "@/lib/domain/leads";
import { priceEstimate } from "@/lib/domain/reviews";
import {
  MAX_ACTIVE_LEADS_PER_CASE,
  MAX_LEADS_PER_PATIENT_DAY,
  MAX_TOTAL_LEADS_PER_CASE,
} from "@/lib/constants/limits";
import type { leadDecisionSchema } from "@/lib/schemas/leads";
import type { BookingStatus, ClinicBookingDto } from "@/lib/types/bookings";
import type { CaseTimeframe } from "@/lib/types/cases";
import type { PriceRange } from "@/lib/types/common";
import type {
  ClinicLeadDetailDto,
  ClinicLeadListItemDto,
  ClinicLeadServiceDto,
  LeadDeclineReason,
  LeadExportDto,
  LeadStatus,
  PatientLeadDto,
} from "@/lib/types/leads";
import {
  ACCOUNT_REQUIRED_MESSAGES,
  accountRequired,
  ApiError,
  clinicNotVerified,
  notFound,
} from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import { BookingsRepository } from "@/models/bookingsRepository";
import type { Tables } from "@/models/db/database.types";
import { PublicMediaStorage } from "@/models/publicMediaStorage";

type LeadDecisionInput = z.infer<typeof leadDecisionSchema>;

type LeadRow = Pick<
  Tables<"leads">,
  | "id"
  | "case_id"
  | "clinic_id"
  | "status"
  | "sent_at"
  | "responded_at"
  | "withdrawn_at"
  | "list_price_min"
  | "list_price_max"
  | "quoted_price_min"
  | "quoted_price_max"
  | "clinic_comment"
  | "decline_reason"
  | "decline_note"
>;

// Patientens læsning af egne leads: leadet og trådens beskeder (kun til at tælle ulæste: klinikkens, endnu ikke læst).
type PatientLeadRow = LeadRow & { messages: { sender_role: "patient" | "clinic"; read_at: string | null }[] | null };

// Rækker fra clinic_leads() og clinic_lead_detail() (architecture 5.7). Felter er null for et tilbagetrukket lead.
// De genererede typer markerer ikke funktionernes kolonner som nullable, så formen angives her.
type ClinicLeadListRow = {
  lead_id: string;
  status: LeadStatus;
  is_emergency: boolean | null;
  service_names: string[] | null;
  postal_code: string | null;
  city: string | null;
  distance_km: number | null;
  preferred_timeframe: CaseTimeframe | null;
  requested_starts_at: string | null;
  image_count: number | null;
  sent_at: string;
  seen_at: string | null;
  withdrawn_at: string | null;
  unread_messages: number | null;
};
type ClinicLeadDetailRow = Omit<ClinicLeadListRow, "service_names"> & {
  services: ClinicLeadServiceDto[] | null;
  summary_text: string | null;
  summary_ai_assisted: boolean | null;
  list_price_min: number | null;
  list_price_max: number | null;
  responded_at: string | null;
  clinic_comment: string | null;
  quoted_price_min: number | null;
  quoted_price_max: number | null;
  decline_reason: LeadDeclineReason | null;
  decline_note: string | null;
  booking_id: string | null;
  booking_service_id: string | null;
  booking_service_name: string | null;
  booking_starts_at: string | null;
  booking_ends_at: string | null;
  booking_status: BookingStatus | null;
  booking_hold_expires_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};
type ClinicLeadImageRow = { image_id: string; storage_path: string; approved_description: string | null };

// Billede på et lead, som serveren bruger det: stien forlader aldrig serveren. Klinikken får ingen AI-vurdering af
// vinkel og kvalitet, kun den godkendte beskrivelse (kan være null, architecture 4.3).
type ClinicLeadImageRecord = {
  id: string;
  storagePath: string;
  view: null;
  quality: null;
  description: string | null;
};

// Detaljen uden billeder; de signeres af controlleren. `unreadMessages` kommer fra clinic_lead_detail().
type ClinicLeadDetailRecord = Omit<ClinicLeadDetailDto, "images">;

// Klinikken bag et lead, som patient_lead_clinics() returnerer den (kun navn, by, logo og removed).
type LeadClinicRow = {
  lead_id: string;
  clinic_id: string;
  name: string;
  city: string;
  logo_path: string | null;
  logo_updated_at: string | null;
  removed: boolean;
};

// Leadet, som en booking bruger det. `serviceIds` er sagens bekræftede ydelser (og en evt. ønsket akutydelse).
export type LeadBookingContext = { id: string; status: LeadStatus; clinicId: string; serviceIds: string[] };
type LeadBookingContextRow = {
  id: string;
  status: LeadStatus;
  clinic_id: string;
  requested_service_id: string | null;
  cases: { case_services: { service_id: string }[] | null } | null;
};

const LEAD_COLUMNS =
  "id, case_id, clinic_id, status, sent_at, responded_at, withdrawn_at, list_price_min, list_price_max, " +
  "quoted_price_min, quoted_price_max, clinic_comment, decline_reason, decline_note";

const lead = (code: string, message: string) => new ApiError(409, code, message);

// Fejl fra send_leads() (architecture 5.3, 10.5). Teksterne står kun her.
const SEND_ERRORS = (): Record<string, ApiError> => ({
  ACCOUNT_REQUIRED: accountRequired(ACCOUNT_REQUIRED_MESSAGES.sendLeads),
  CONSENT_REQUIRED: new ApiError(403, "CONSENT_REQUIRED", "Du skal give samtykke til deling med klinikker først."),
  NOT_FOUND: notFound(),
  INVALID_CLINICS: new ApiError(400, "VALIDATION_ERROR", `Vælg 1-${MAX_ACTIVE_LEADS_PER_CASE} forskellige klinikker.`),
  CASE_NOT_READY: lead("CASE_NOT_READY", "Sagen er ikke klar til at blive sendt. Godkend opsummeringen og vælg behandling og tidsrum."),
  CLINIC_NOT_AVAILABLE: lead("CLINIC_NOT_AVAILABLE", "En af klinikkerne kan ikke modtage henvendelser lige nu."),
  CLINIC_ALREADY_CONTACTED: lead("CLINIC_ALREADY_CONTACTED", "Du har allerede kontaktet en af klinikkerne med denne sag."),
  // Samtidige afsendelser, der rammer unique (case_id, clinic_id).
  leads_case_id_clinic_id_key: lead("CLINIC_ALREADY_CONTACTED", "Du har allerede kontaktet en af klinikkerne med denne sag."),
  LEAD_LIMIT: lead(
    "LEAD_LIMIT",
    `Du kan højst have ${MAX_ACTIVE_LEADS_PER_CASE} aktive henvendelser pr. sag. Træk en tilbage for at vælge en anden klinik.`,
  ),
  LEAD_TOTAL_LIMIT: lead(
    "LEAD_TOTAL_LIMIT",
    `Du har nået det samlede antal på ${MAX_TOTAL_LEADS_PER_CASE} henvendelser for denne sag.`,
  ),
  LEAD_DAILY_LIMIT: new ApiError(
    429,
    "LEAD_DAILY_LIMIT",
    `Du kan højst sende ${MAX_LEADS_PER_PATIENT_DAY} henvendelser i døgnet. Prøv igen i morgen.`,
  ),
});

// Fejl fra clinic_decide_lead() (architecture 5.3, 10.9). En fremmed klinik får NOT_FOUND, altså 404 (2.4).
const DECIDE_ERRORS = (): Record<string, ApiError> => {
  const invalid = (message: string) => new ApiError(400, "VALIDATION_ERROR", message);
  return {
    NOT_FOUND: notFound(),
    CLINIC_NOT_VERIFIED: clinicNotVerified(),
    LEAD_NOT_PENDING: lead("LEAD_NOT_PENDING", "Henvendelsen afventer ikke svar længere, fx fordi patienten har trukket den tilbage."),
    INVALID_COMMENT: invalid("Teksten er for lang."),
    INVALID_PRICE: invalid("Prisen er ugyldig. Laveste pris må ikke være højere end højeste pris."),
    DECLINE_REASON_REQUIRED: invalid("Vælg en begrundelse."),
    INVALID_DECLINE_REASON: invalid("Vælg en begrundelse."),
    INVALID_DECISION: invalid("Ugyldig beslutning."),
  };
};

// Fejl fra withdraw_lead().
const WITHDRAW_ERRORS = (): Record<string, ApiError> => ({
  ACCOUNT_REQUIRED: accountRequired(ACCOUNT_REQUIRED_MESSAGES.withdrawLead),
  NOT_FOUND: notFound(),
  LEAD_NOT_PENDING: lead("LEAD_NOT_PENDING", "Klinikken har allerede svaret, så henvendelsen kan ikke trækkes tilbage."),
});

function priceRange(min: number | null, max: number | null) {
  return min !== null && max !== null ? { min, max } : null;
}

// Leads (architecture 4.3, 10.9). Brugerens JWT, så RLS afgør, at patienten kun ser egne leads. Oprettelse og
// tilbagetrækning sker kun gennem send_leads() og withdraw_lead() (security definer, tjekker selv ejerskab).
// Rækkerne mappes direkte til DTO'erne (klinikken kommer fra patient_lead_clinics()), så toDto() i basisklassen ikke bruges.
export class LeadsRepository extends BaseRepository<PatientLeadRow> {
  private toPatientDto(row: PatientLeadRow, clinic: LeadClinicRow | undefined): PatientLeadDto {
    return {
      id: row.id,
      clinic: {
        id: row.clinic_id,
        name: clinic?.name ?? "",
        city: clinic?.city ?? "",
        logoUrl: clinic?.logo_path
          ? PublicMediaStorage.publicUrl(clinic.logo_path, clinic.logo_updated_at ? Date.parse(clinic.logo_updated_at) : undefined)
          : null,
        removed: clinic?.removed ?? false,
      },
      status: row.status,
      sentAt: row.sent_at,
      respondedAt: row.responded_at,
      listPrice: priceRange(row.list_price_min, row.list_price_max),
      quotedPrice: priceRange(row.quoted_price_min, row.quoted_price_max),
      clinicComment: row.clinic_comment,
      declineReason: row.decline_reason,
      declineNote: row.decline_note,
      booking: null, // lægges på af LeadsController (BookingsRepository.currentByLead)
      unreadMessages: (row.messages ?? []).filter((m) => m.sender_role === "clinic" && m.read_at === null).length,
    };
  }

  private toExportDto(row: LeadRow, clinicName: string): LeadExportDto {
    return {
      id: row.id,
      caseId: row.case_id,
      clinicId: row.clinic_id,
      clinicName,
      status: row.status,
      sentAt: row.sent_at,
      respondedAt: row.responded_at,
      withdrawnAt: row.withdrawn_at,
      listPrice: priceRange(row.list_price_min, row.list_price_max),
      quotedPrice: priceRange(row.quoted_price_min, row.quoted_price_max),
      clinicComment: row.clinic_comment,
      declineReason: row.decline_reason,
    };
  }

  // Klinikkerne bag patientens egne leads (patient_lead_clinics(), 10.9), pr. lead-id. Valgfrit indsnævret til én sag.
  private async clinicsByLead(caseId?: string): Promise<Map<string, LeadClinicRow>> {
    const rows = await this.rpc<LeadClinicRow[]>("patient_lead_clinics", caseId ? { p_case_id: caseId } : {});
    return new Map((rows ?? []).map((row) => [row.lead_id, row]));
  }

  // Klinikkens navn og om den er fjernet, pr. lead-id på alle egne sager (til sagsoversigten).
  async clinicsForList(): Promise<Map<string, { name: string; removed: boolean }>> {
    const clinics = await this.clinicsByLead();
    return new Map([...clinics].map(([leadId, clinic]) => [leadId, { name: clinic.name, removed: clinic.removed }]));
  }

  // Antal leads på sagen: aktive (sendt, accepteret, booket) og i alt (også afviste og tilbagetrukne). RLS: egne leads.
  async countForCase(caseId: string): Promise<{ active: number; total: number }> {
    const rows = await this.runList<{ status: LeadStatus }>(
      this.db.from("leads").select("status").eq("case_id", caseId),
      "leads: select fejlede",
    );
    return { active: rows.filter((row) => isActiveLead(row.status)).length, total: rows.length };
  }

  // send_leads(): tjekker konto, ejer, samtykke, godkendt opsummering, verificerede klinikker og lofterne. Returnerer antal.
  async sendLeads(caseId: string, clinicIds: string[]): Promise<number> {
    const created = await this.rpc<number>("send_leads", { p_case_id: caseId, p_clinic_ids: clinicIds }, SEND_ERRORS());
    return created ?? 0;
  }

  // withdraw_lead(): kun fra `sent`. Ejerskab tjekkes i funktionen (fremmed lead giver NOT_FOUND, altså 404).
  async withdrawLead(leadId: string): Promise<void> {
    await this.rpc("withdraw_lead", { p_lead_id: leadId }, WITHDRAW_ERRORS());
  }

  // Patientens leads på en sag (nyeste først). Tom liste for en sag uden leads.
  async listForCase(caseId: string): Promise<PatientLeadDto[]> {
    const rows = await this.runList<PatientLeadRow>(
      this.db
        .from("leads")
        .select(`${LEAD_COLUMNS}, messages(sender_role, read_at)`)
        .eq("case_id", caseId)
        .order("sent_at", { ascending: false }),
      "leads: select fejlede",
    );
    const clinics = await this.clinicsByLead(caseId);
    return rows.map((row) => this.toPatientDto(row, clinics.get(row.id)));
  }

  // Egen lead (RLS: andres leads giver null, så 404).
  async requireOwn(leadId: string): Promise<PatientLeadDto> {
    const row = await this.run<PatientLeadRow>(
      this.db.from("leads").select(`${LEAD_COLUMNS}, messages(sender_role, read_at)`).eq("id", leadId).maybeSingle(),
      "leads: select fejlede",
    );
    const found = this.requireRow(row);
    const clinics = await this.clinicsByLead(found.case_id);
    return this.toPatientDto(found, clinics.get(found.id));
  }

  // Leadets status for den, der har adgang. Patienten læser sit eget lead (RLS: sagens ejer). Klinikken har ingen SELECT på
  // leads og bruger clinic_lead_status() (verificeret ejer, sent_at >= owner_since), som også giver en tilbagetrukket
  // status, men intet indhold. Andre får 404. Bruges af beskedtråden.
  async requireStatus(leadId: string, role: "patient" | "clinic"): Promise<LeadStatus> {
    if (role === "clinic") {
      return this.requireRow(await this.rpc<LeadStatus>("clinic_lead_status", { p_lead_id: leadId }));
    }
    const row = await this.run<{ status: LeadStatus }>(
      this.db.from("leads").select("status").eq("id", leadId).maybeSingle(),
      "leads: select fejlede",
    );
    return this.requireRow(row).status;
  }

  // Det en booking kræver at vide om patientens eget lead: status, klinik, de ydelser sagen har bekræftet og den ønskede
  // akutydelse (kun ved akut-lead). RLS: andres leads giver null, så 404.
  async requireBookingContext(leadId: string): Promise<LeadBookingContext> {
    const row = await this.run<LeadBookingContextRow>(
      this.db
        .from("leads")
        .select("id, status, clinic_id, requested_service_id, cases(case_services(service_id))")
        .eq("id", leadId)
        .maybeSingle(),
      "leads: select fejlede",
    );
    const found = this.requireRow(row);
    const serviceIds = (found.cases?.case_services ?? []).map((service) => service.service_id);
    if (found.requested_service_id) serviceIds.push(found.requested_service_id);
    return { id: found.id, status: found.status, clinicId: found.clinic_id, serviceIds: [...new Set(serviceIds)] };
  }

  // Prisoverslaget pr. lead (architecture 8.2): klinikkens præciserede pris, ellers listepris-snapshottet, ellers null.
  async priceEstimates(leadIds: readonly string[]): Promise<Map<string, PriceRange | null>> {
    const result = new Map<string, PriceRange | null>();
    if (leadIds.length === 0) return result;
    const rows = await this.runList<Pick<LeadRow, "id" | "list_price_min" | "list_price_max" | "quoted_price_min" | "quoted_price_max">>(
      this.db.from("leads").select("id, list_price_min, list_price_max, quoted_price_min, quoted_price_max").in("id", [...leadIds]),
      "leads: prisoverslag fejlede",
    );
    for (const row of rows) {
      result.set(row.id, priceEstimate(priceRange(row.quoted_price_min, row.quoted_price_max), priceRange(row.list_price_min, row.list_price_max)));
    }
    return result;
  }

  // Alle egne leads med klinikkens navn til dataeksporten.
  async listOwnForExport(): Promise<LeadExportDto[]> {
    const rows = await this.runList<LeadRow>(
      this.db.from("leads").select(LEAD_COLUMNS).order("sent_at", { ascending: true }),
      "leads: eksport fejlede",
    );
    const clinics = await this.clinicsByLead();
    return rows.map((row) => this.toExportDto(row, clinics.get(row.id)?.name ?? ""));
  }
  // ---- Klinikkens visning (architecture 5.7, 10.9). Kun gennem clinic_*-funktionerne, aldrig patient_id eller sags-id. ----

  private toClinicListItem(row: ClinicLeadListRow): ClinicLeadListItemDto {
    return {
      id: row.lead_id,
      status: row.status,
      isEmergency: row.is_emergency ?? false,
      serviceNames: row.service_names ?? [],
      area: { postalCode: row.postal_code, city: row.city },
      distanceKm: row.distance_km,
      preferredTimeframe: row.preferred_timeframe,
      requestedStartsAt: row.requested_starts_at,
      imageCount: row.image_count ?? 0,
      sentAt: row.sent_at,
      seenAt: row.seen_at,
      withdrawnAt: row.withdrawn_at,
      unreadMessages: row.unread_messages ?? 0,
    };
  }

  private toClinicBooking(row: ClinicLeadDetailRow): ClinicBookingDto | null {
    if (!row.booking_id || !row.booking_status || !row.booking_starts_at || !row.booking_ends_at) return null;
    // Databasen returnerer kontaktfelterne kun for booked/completed (5.5); de mappes, som de er.
    return BookingsRepository.toClinicDto({
      id: row.booking_id,
      leadId: row.lead_id,
      serviceId: row.booking_service_id ?? "",
      serviceName: row.booking_service_name ?? "",
      startsAt: row.booking_starts_at,
      endsAt: row.booking_ends_at,
      status: row.booking_status,
      holdExpiresAt: row.booking_hold_expires_at,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
    });
  }

  // Klinikkens leads (clinic_leads), evt. filtreret på status. Tom liste for en klinik, der ikke er verificeret.
  async listForClinic(status?: LeadStatus): Promise<ClinicLeadListItemDto[]> {
    const rows = await this.rpc<ClinicLeadListRow[]>("clinic_leads", status ? { p_status: status } : {});
    return (rows ?? []).map((row) => this.toClinicListItem(row));
  }

  // Sætter seen_at første gang. Gør intet for et fremmed eller tilbagetrukket lead.
  async markSeen(leadId: string): Promise<void> {
    await this.rpc("clinic_mark_lead_seen", { p_lead_id: leadId });
  }

  // Leadet, som klinikken ser det (clinic_lead_detail). Fremmed lead giver tom liste, altså 404. Kontaktfelter og
  // booking følger databasens regel (5.5). Billeder lægges på af controlleren.
  async requireClinicDetail(leadId: string): Promise<ClinicLeadDetailRecord> {
    const rows = await this.rpc<ClinicLeadDetailRow[]>("clinic_lead_detail", { p_lead_id: leadId });
    const row = this.requireRow(rows?.[0]);
    const services = row.services ?? [];
    return {
      ...this.toClinicListItem({ ...row, service_names: services.map((service) => service.name) }),
      services,
      summaryText: row.summary_text ?? "",
      summaryAiAssisted: row.summary_ai_assisted ?? false,
      listPrice: priceRange(row.list_price_min, row.list_price_max),
      decision:
        row.responded_at !== null
          ? {
              comment: row.clinic_comment,
              quotedPrice: priceRange(row.quoted_price_min, row.quoted_price_max),
              declineReason: row.decline_reason,
              declineNote: row.decline_note,
              respondedAt: row.responded_at,
            }
          : null,
      booking: this.toClinicBooking(row),
    };
  }

  // Billederne på et lead (clinic_lead_images): kun med patientens aktive samtykke og aldrig for et tilbagetrukket lead.
  async listClinicImages(leadId: string): Promise<ClinicLeadImageRecord[]> {
    const rows = await this.rpc<ClinicLeadImageRow[]>("clinic_lead_images", { p_lead_id: leadId });
    return (rows ?? []).map((row) => ({
      id: row.image_id,
      storagePath: row.storage_path,
      view: null,
      quality: null,
      description: row.approved_description,
    }));
  }

  // clinic_decide_lead(): kun fra `sent`. Databasen tjekker ejer og verifikation og gør en gyldig reservation til en booking.
  async decideLead(leadId: string, input: LeadDecisionInput): Promise<void> {
    const args =
      input.decision === "accept"
        ? {
            p_lead_id: leadId,
            p_decision: "accept",
            p_comment: input.comment ?? null,
            p_quoted_min: input.quotedPriceMin ?? null,
            p_quoted_max: input.quotedPriceMax ?? null,
          }
        : { p_lead_id: leadId, p_decision: "decline", p_decline_reason: input.reason, p_decline_note: input.note ?? null };
    await this.rpc("clinic_decide_lead", args, DECIDE_ERRORS());
  }
}
