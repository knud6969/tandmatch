import type { PatientLeadDto } from "@/lib/types/leads";
import { apiRequest } from "./client";

// Leads (architecture 10.5). Kræver konto og gældende health_data_sharing-samtykke; fejlkoderne (LEAD_LIMIT,
// LEAD_DAILY_LIMIT, CLINIC_NOT_AVAILABLE, CONSENT_REQUIRED osv.) kommer som ApiRequestError med dansk tekst.
export async function sendLeads(caseId: string, clinicIds: string[]): Promise<PatientLeadDto[]> {
  const result = await apiRequest<{ leads: PatientLeadDto[] }>(`/api/cases/${caseId}/leads`, { method: "POST", json: { clinicIds } });
  return result.leads;
}

// Sagens leads; en anonym ejer får en tom liste.
export async function listCaseLeads(caseId: string): Promise<PatientLeadDto[]> {
  const result = await apiRequest<{ leads: PatientLeadDto[] }>(`/api/cases/${caseId}/leads`);
  return result.leads;
}
