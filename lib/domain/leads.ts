import { LEAD_ACTIVE_STATUSES } from "@/lib/constants/leads";
import { MAX_ACTIVE_LEADS_PER_CASE, MAX_TOTAL_LEADS_PER_CASE } from "@/lib/constants/limits";
import type { CaseRecordDto } from "@/lib/types/cases";
import type { LeadStatus } from "@/lib/types/leads";

// Tæller leadet med i de højst 3 aktive pr. sag? (Spejler is_lead_active_status() i databasen.)
export function isActiveLead(status: LeadStatus): boolean {
  return (LEAD_ACTIVE_STATUSES as readonly string[]).includes(status);
}

// Er der plads til flere leads? Under 3 aktive og, hvis antallet kendes, under 10 i alt (afviste og tilbagetrukne
// tæller ikke i de 3, men i de 10). Databasen er den endelige vogter (send_leads() og leads_before_insert()).
export function canSendMoreLeads(activeLeadCount: number, totalLeadCount = 0): boolean {
  return activeLeadCount < MAX_ACTIVE_LEADS_PER_CASE && totalLeadCount < MAX_TOTAL_LEADS_PER_CASE;
}

// Kan sagen sendes videre til flere klinikker? Ikke lukket (en sendt sag kan sendes til flere, som i send_leads()),
// godkendt opsummering, postnummer, tidsrum og mindst én bekræftet ydelse, og plads til flere aktive leads.
// Kontoen og samtykket tjekkes af send_leads().
export function canSendCase(
  record: Pick<CaseRecordDto, "status" | "summaryApprovedAt" | "postalCode" | "preferredTimeframe">,
  serviceCount: number,
  activeLeadCount: number,
): boolean {
  return (
    record.status !== "closed" &&
    record.summaryApprovedAt !== null &&
    record.postalCode !== null &&
    record.preferredTimeframe !== null &&
    serviceCount > 0 &&
    canSendMoreLeads(activeLeadCount)
  );
}
