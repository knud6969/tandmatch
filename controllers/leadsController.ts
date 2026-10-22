import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { emergencyLeadSchema, leadDecisionSchema, sendLeadsSchema } from "@/lib/schemas/leads";
import type {
  ClinicLeadDetailDto,
  ClinicLeadListItemDto,
  EmergencyLeadCreatedDto,
  LeadStatus,
  PatientLeadDto,
} from "@/lib/types/leads";
import type { Session } from "@/platform/middleware/session";
import { BookingsRepository } from "@/models/bookingsRepository";
import { CasesRepository } from "@/models/casesRepository";
import { ClinicsRepository } from "@/models/clinicsRepository";
import { ConsentsRepository } from "@/features/identity/consentsRepository";
import { lazyAdminClient } from "@/platform/db/admin";
import { LeadsRepository } from "@/models/leadsRepository";
import { CaseImageUrlService } from "@/services/caseImageUrlService";

type SendLeadsInput = z.infer<typeof sendLeadsSchema>;
type LeadDecisionInput = z.infer<typeof leadDecisionSchema>;
type EmergencyLeadInput = z.infer<typeof emergencyLeadSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type LeadsDeps = {
  leads: LeadsRepository;
  bookings: BookingsRepository;
  cases: CasesRepository;
  clinics: ClinicsRepository;
  consents: ConsentsRepository;
  imageUrls: CaseImageUrlService;
  admin: () => SupabaseClient;
};

// Leads (architecture 10.5, 10.9). Én controller for ressourcen, to roller.
// Patienten: afsendelse til op til 3 klinikker, oversigt og tilbagetrækning. Reglerne (konto, samtykke, verificerede
// klinikker, lofter) håndhæves af send_leads() og withdraw_lead(); withdraw_lead() giver 404 for et fremmed lead (2.4).
// Klinikken: oversigt, detalje og beslutning. Klinikken læser kun gennem clinic_*-funktionerne (5.7), som aldrig
// returnerer patientens navn, kontakt eller id, og som kun giver kontaktfelter for en booket tid (5.5).
export class LeadsController {
  private readonly leads: LeadsRepository;
  private readonly bookings: BookingsRepository;
  private readonly cases: CasesRepository;
  private readonly clinics: ClinicsRepository;
  private readonly consents: ConsentsRepository;
  private readonly imageUrls: CaseImageUrlService;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<LeadsDeps> = {},
  ) {
    this.leads = deps.leads ?? new LeadsRepository(supabase);
    this.bookings = deps.bookings ?? new BookingsRepository(supabase);
    this.cases = deps.cases ?? new CasesRepository(supabase);
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
    this.consents = deps.consents ?? new ConsentsRepository(supabase);
    // 2.3 (e): signering af billed-URL'er efter en RLS-beskyttet læsning (clinic_lead_images()). Klienten oprettes først ved brug.
    this.imageUrls = deps.imageUrls ?? new CaseImageUrlService(deps.admin ?? lazyAdminClient());
  }

  // ---- Patienten ----

  // Sender sagen til de valgte klinikker og returnerer de nye leads.
  async send(caseId: string, input: SendLeadsInput): Promise<PatientLeadDto[]> {
    await this.cases.requireOwn(caseId);
    await this.requireCurrentSharingConsent();
    await this.leads.sendLeads(caseId, input.clinicIds);
    const created = new Set(input.clinicIds);
    return this.withBookings((await this.leads.listForCase(caseId)).filter((lead) => created.has(lead.clinic.id)));
  }

  // Akutvejen (architecture 10.11): sag, ydelse, lead og reservation i én transaktion i databasen. Samme samtykketjek som
  // send(); resten (konto, verificeret klinik, tid, lofter) håndhæver send_emergency_lead() og send_leads().
  async sendEmergency(input: EmergencyLeadInput): Promise<EmergencyLeadCreatedDto> {
    await this.requireCurrentSharingConsent();
    const { caseId, leadId } = await this.leads.sendEmergency(input);
    const created = (await this.leads.listForCase(caseId)).filter((lead) => lead.id === leadId);
    const [lead] = await this.withBookings(created);
    return { caseId, lead };
  }

  // Kræver et aktivt delingssamtykke med den gældende tekstversion (architecture 4.3, 10.5). Et samtykke til en
  // ældre tekst giver ikke ret til nye leads. Databasen tjekker selv typen i send_leads() som sidste værn.
  private async requireCurrentSharingConsent(): Promise<void> {
    await this.consents.requireCurrentActive("health_data_sharing", "Du skal give samtykke til deling med klinikker først.");
  }

  async listForCase(caseId: string): Promise<PatientLeadDto[]> {
    await this.cases.requireOwn(caseId);
    return this.withBookings(await this.leads.listForCase(caseId));
  }

  // Trækker et ubesvaret lead tilbage (409 LEAD_NOT_PENDING, hvis klinikken har svaret).
  async withdraw(leadId: string): Promise<PatientLeadDto> {
    await this.leads.withdrawLead(leadId); // fremmed lead giver NOT_FOUND (404) fra withdraw_lead()
    return (await this.withBookings([await this.leads.requireOwn(leadId)]))[0];
  }

  // Lægger hvert leads aktuelle booking på (aktiv, ellers den nyeste; null uden booking, architecture 10.9).
  private async withBookings(leads: PatientLeadDto[]): Promise<PatientLeadDto[]> {
    if (leads.length === 0) return leads;
    const bookings = await this.bookings.currentByLead();
    return leads.map((lead) => ({ ...lead, booking: bookings.get(lead.id) ?? null }));
  }

  // ---- Klinikken ----

  // Klinikkens leads, evt. filtreret på status. Kun verificerede klinikker modtager leads (403 CLINIC_NOT_VERIFIED).
  async listForClinic(status?: LeadStatus): Promise<ClinicLeadListItemDto[]> {
    await this.clinics.requireOwnVerified(this.session.userId);
    return this.leads.listForClinic(status);
  }

  // Leadet i detaljer. Åbningen markerer det som set (pragmatisk sideeffekt, architecture 10.9). Fremmed lead giver 404.
  async getForClinic(leadId: string): Promise<ClinicLeadDetailDto> {
    await this.clinics.requireOwnVerified(this.session.userId);
    await this.leads.markSeen(leadId);
    return this.clinicDetail(leadId);
  }

  // Accept (evt. med kommentar og præciseret pris) eller afvisning. 409 LEAD_NOT_PENDING, hvis leadet ikke er `sent`.
  // Accept af et akut-lead inden for reservationen gør tiden til en booking; det afgør databasen (clinic_decide_lead()).
  async decide(leadId: string, input: LeadDecisionInput): Promise<ClinicLeadDetailDto> {
    await this.clinics.requireOwnVerified(this.session.userId);
    await this.leads.decideLead(leadId, input);
    return this.clinicDetail(leadId);
  }


  // Detaljen med signerede billeder. Et tilbagetrukket lead har hverken billeder eller beskeder (5.7).
  private async clinicDetail(leadId: string): Promise<ClinicLeadDetailDto> {
    const detail = await this.leads.requireClinicDetail(leadId);
    if (detail.status === "withdrawn") return { ...detail, images: [] };
    const records = await this.leads.listClinicImages(leadId);
    const signed = await this.imageUrls.toDtos(records);
    return {
      ...detail,
      images: signed.map((image, i) => ({ ...image, approvedDescription: records[i].description })),
    };
  }
}
