import { listCases } from "~/api/cases";
import { listCaseLeads } from "~/api/leads";

// Sagen et lead hører til. Bookingen kender kun leadet; "Skriv til klinikken" fra "Flyt tid" skal bruge sagen (beskedtråden
// ligger under sagen). Slår op i patientens egne sager; null, hvis leadet ikke findes (fx sagen er slettet).
export async function findCaseIdForLead(leadId: string): Promise<string | null> {
  for (const item of await listCases()) {
    const leads = await listCaseLeads(item.id).catch(() => []);
    if (leads.some((lead) => lead.id === leadId)) return item.id;
  }
  return null;
}
