import "server-only";
import { isActiveLead } from "@/lib/domain/leads";
import {
  MAX_ACTIVE_LEADS_PER_CASE,
  MAX_LEADS_PER_PATIENT_DAY,
  MAX_TOTAL_LEADS_PER_CASE,
} from "@/lib/constants/limits";
import type { LeadExportDto, LeadStatus, PatientLeadDto } from "@/lib/types/leads";
import { ACCOUNT_REQUIRED_MESSAGES, accountRequired, ApiError, notFound } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";
import { PublicMediaStorage } from "@/models/publicMediaStorage";

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
>;

// Patientens læsning af egne leads: leadet og trådens beskeder (kun til at tælle ulæste).
type PatientLeadRow = LeadRow & { messages: { sender_id: string; read_at: string | null }[] | null };

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

const LEAD_COLUMNS =
  "id, case_id, clinic_id, status, sent_at, responded_at, withdrawn_at, list_price_min, list_price_max, " +
  "quoted_price_min, quoted_price_max, clinic_comment, decline_reason";

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
  private toPatientDto(row: PatientLeadRow, clinic: LeadClinicRow | undefined, userId: string): PatientLeadDto {
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
      booking: null,
      unreadMessages: (row.messages ?? []).filter((m) => m.read_at === null && m.sender_id !== userId).length,
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
  async listForCase(caseId: string, userId: string): Promise<PatientLeadDto[]> {
    const rows = await this.runList<PatientLeadRow>(
      this.db
        .from("leads")
        .select(`${LEAD_COLUMNS}, messages(sender_id, read_at)`)
        .eq("case_id", caseId)
        .order("sent_at", { ascending: false }),
      "leads: select fejlede",
    );
    const clinics = await this.clinicsByLead(caseId);
    return rows.map((row) => this.toPatientDto(row, clinics.get(row.id), userId));
  }

  // Egen lead (RLS: andres leads giver null, så 404).
  async requireOwn(leadId: string, userId: string): Promise<PatientLeadDto> {
    const row = await this.run<PatientLeadRow>(
      this.db.from("leads").select(`${LEAD_COLUMNS}, messages(sender_id, read_at)`).eq("id", leadId).maybeSingle(),
      "leads: select fejlede",
    );
    const found = this.requireRow(row);
    const clinics = await this.clinicsByLead(found.case_id);
    return this.toPatientDto(found, clinics.get(found.id), userId);
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
}
