import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { canSendCase } from "@/lib/domain/leads";
import type { patchCaseSchema, putCaseServicesSchema } from "@/lib/schemas/cases";
import type { CaseDto, CaseListItemDto, CaseRecordDto } from "@/lib/types/cases";
import { notDraft } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { CaseImageStorage } from "@/models/caseImageStorage";
import { CaseImagesRepository } from "@/models/caseImagesRepository";
import { CaseServicesRepository } from "@/models/caseServicesRepository";
import { CasesRepository } from "@/models/casesRepository";
import { lazyAdminClient } from "@/models/db/admin";
import { LeadsRepository } from "@/models/leadsRepository";
import { ServicesRepository } from "@/models/servicesRepository";
import { CaseImageUrlService } from "@/services/caseImageUrlService";

type PatchCaseInput = z.infer<typeof patchCaseSchema>;
type PutServicesInput = z.infer<typeof putCaseServicesSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type CasesDeps = {
  cases: CasesRepository;
  caseServices: CaseServicesRepository;
  images: CaseImagesRepository;
  leads: LeadsRepository;
  services: ServicesRepository;
  imageUrls: CaseImageUrlService;
  admin: () => SupabaseClient;
};

// Patientens sager (architecture 10.5): kladden kan redigeres, ydelser bekræftes, sagen lukkes eller slettes.
// Alle læsninger sker med patientens JWT, så RLS afgør, at kun ejeren ser sagen; andres sager giver 404 (2.4).
// Anonyme patienter må alt på deres egen kladde; at oprette flere sager kræver konto (routen).
export class CasesController {
  private readonly cases: CasesRepository;
  private readonly caseServices: CaseServicesRepository;
  private readonly images: CaseImagesRepository;
  private readonly leads: LeadsRepository;
  private readonly services: ServicesRepository;
  private readonly imageUrls: CaseImageUrlService;
  // Service role-klienten (architecture 2.3, 2.1.1). Bruges kun til signering og sletning af billedfiler og sagen.
  private readonly admin: () => SupabaseClient;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<CasesDeps> = {},
  ) {
    this.admin = deps.admin ?? lazyAdminClient();
    this.cases = deps.cases ?? new CasesRepository(supabase);
    this.caseServices = deps.caseServices ?? new CaseServicesRepository(supabase);
    this.images = deps.images ?? new CaseImagesRepository(supabase);
    this.leads = deps.leads ?? new LeadsRepository(supabase);
    this.services = deps.services ?? new ServicesRepository(supabase);
    this.imageUrls = deps.imageUrls ?? new CaseImageUrlService(this.admin);
  }

  // Samler sagen til DTO'en: bekræftede ydelser, AI-forslag, billeder med friske signerede URL'er og antal leads.
  private async toCaseDto(record: CaseRecordDto): Promise<CaseDto> {
    const [confirmed, imageRecords, conversation, leadCounts] = await Promise.all([
      this.caseServices.listForCase(record.id),
      this.images.listForCase(record.id),
      this.cases.findConversationInfo(record.id),
      this.leads.countForCase(record.id),
    ]);
    const confirmedIds = new Set(confirmed.map((c) => c.serviceId));
    const catalog = await this.services.findActive([...confirmedIds, ...conversation.suggestedServiceIds]);
    const byId = new Map(catalog.map((service) => [service.id, service]));

    // Ydelser, der er blevet inaktive i kataloget, vises ikke længere.
    const services = confirmed.flatMap((c) => {
      const service = byId.get(c.serviceId);
      return service ? [{ ...service, suggestedByAi: c.suggestedByAi }] : [];
    });
    const suggestedServices = conversation.suggestedServiceIds.flatMap((id) => {
      const service = byId.get(id);
      return service && !confirmedIds.has(id) ? [service] : [];
    });

    return {
      id: record.id,
      status: record.status,
      isEmergency: record.isEmergency,
      postalCode: record.postalCode,
      preferredTimeframe: record.preferredTimeframe,
      services,
      suggestedServices,
      images: await this.imageUrls.toDtos(imageRecords),
      hasConversation: conversation.hasConversation,
      aiSummary: record.aiSummary,
      summaryText: record.summaryText,
      summaryApprovedAt: record.summaryApprovedAt,
      submittedAt: record.submittedAt,
      leadCount: leadCounts.active,
      totalLeadCount: leadCounts.total,
      canSend: canSendCase(record, services.length, leadCounts.active, leadCounts.total),
    };
  }

  // Oversigten over egne sager. Klinikkens navn kommer fra patient_lead_clinics() (også for fjernede klinikker);
  // bookinger kommer med trin 6.
  async list(): Promise<CaseListItemDto[]> {
    const [rows, clinics] = await Promise.all([this.cases.listOwnForList(), this.leads.clinicsForList()]);
    return rows.map(({ record, serviceNames, leads }) => ({
      id: record.id,
      status: record.status,
      isEmergency: record.isEmergency,
      serviceNames,
      submittedAt: record.submittedAt,
      leads: leads.map((lead) => ({
        id: lead.id,
        clinicName: clinics.get(lead.id)?.name ?? "",
        status: lead.status,
        removed: clinics.get(lead.id)?.removed ?? false,
      })),
      nextBooking: null,
    }));
  }

  async create(): Promise<CaseDto> {
    return this.toCaseDto(await this.cases.create(this.session.userId));
  }

  async get(caseId: string): Promise<CaseDto> {
    return this.toCaseDto(await this.cases.requireOwn(caseId));
  }

  async patch(caseId: string, input: PatchCaseInput): Promise<CaseDto> {
    await this.cases.requireOwnDraft(caseId);
    return this.toCaseDto(await this.cases.update(caseId, input));
  }

  // Bekræfter ydelserne (1-5). Hver skal være aktiv i kataloget (400 UNKNOWN_SERVICE).
  async putServices(caseId: string, input: PutServicesInput): Promise<CaseDto> {
    const record = await this.cases.requireOwnDraft(caseId);
    await this.services.requireActive(input.services.map((s) => s.serviceId));
    await this.caseServices.replace(caseId, input.services);
    return this.toCaseDto(record);
  }

  // Lukker sagen med close_case() (idempotent). Ejerskab tjekkes først, så en fremmed sag giver 404.
  async close(caseId: string): Promise<CaseDto> {
    await this.cases.requireOwn(caseId);
    await this.cases.close(caseId);
    return this.toCaseDto(await this.cases.requireOwn(caseId));
  }

  // Sletter kladden og billedfilerne. Patienten har ingen DELETE-policy på cases (5.4), så sagen slettes med service
  // role efter ejer- og kladdetjekket ovenfor. Rækken slettes først, med betingelsen `status = 'draft'` (L4): en sag, der
  // imellemtiden er sendt, kan så hverken miste rækken eller billedfilerne. Filerne slettes bagefter; en fejl dér efterlader
  // kun forældreløse filer, som oprydningen tager.
  async delete(caseId: string): Promise<void> {
    await this.cases.requireOwnDraft(caseId);
    // 2.3 (c): sagen og billedfilerne slettes med service role, efter ejer- og kladdetjek.
    if (!(await new CasesRepository(this.admin()).deleteDraft(caseId))) throw notDraft();
    await new CaseImageStorage(this.admin()).removeCase(caseId);
  }
}
