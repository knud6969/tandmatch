import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { sendLeadsSchema } from "@/lib/schemas/leads";
import type { PatientLeadDto } from "@/lib/types/leads";
import type { Session } from "@/middleware/session";
import { CasesRepository } from "@/models/casesRepository";
import { LeadsRepository } from "@/models/leadsRepository";

type SendLeadsInput = z.infer<typeof sendLeadsSchema>;

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type LeadsDeps = { leads: LeadsRepository; cases: CasesRepository };

// Patientens leads (architecture 10.5, 10.9): afsendelse til op til 3 klinikker, oversigt og tilbagetrækning.
// Reglerne (konto, samtykke, verificerede klinikker, lofter) håndhæves af send_leads() og withdraw_lead() i databasen;
// controlleren tjekker ejerskab af sagen først, og withdraw_lead() giver 404 for et fremmed lead (2.4).
export class LeadsController {
  private readonly leads: LeadsRepository;
  private readonly cases: CasesRepository;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<LeadsDeps> = {},
  ) {
    this.leads = deps.leads ?? new LeadsRepository(supabase);
    this.cases = deps.cases ?? new CasesRepository(supabase);
  }

  // Sender sagen til de valgte klinikker og returnerer de nye leads.
  async send(caseId: string, input: SendLeadsInput): Promise<PatientLeadDto[]> {
    await this.cases.requireOwn(caseId);
    await this.leads.sendLeads(caseId, input.clinicIds);
    const created = new Set(input.clinicIds);
    return (await this.leads.listForCase(caseId, this.session.userId)).filter((lead) => created.has(lead.clinic.id));
  }

  async listForCase(caseId: string): Promise<PatientLeadDto[]> {
    await this.cases.requireOwn(caseId);
    return this.leads.listForCase(caseId, this.session.userId);
  }

  // Trækker et ubesvaret lead tilbage (409 LEAD_NOT_PENDING, hvis klinikken har svaret).
  async withdraw(leadId: string): Promise<PatientLeadDto> {
    await this.leads.withdrawLead(leadId); // fremmed lead giver NOT_FOUND (404) fra withdraw_lead()
    return this.leads.requireOwn(leadId, this.session.userId);
  }
}
