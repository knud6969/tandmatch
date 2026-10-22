import { LEAD_ACTIVE_STATUSES } from "@/lib/leads/constants/leads";
import { MAX_ACTIVE_LEADS_PER_CASE, MAX_TOTAL_LEADS_PER_CASE } from "@/lib/common/constants/limits";
import type { CaseRecordDto } from "@/lib/cases/types/cases";
import type { LeadStatus } from "@/lib/leads/types/leads";

// Tæller leadet med i de højst 3 aktive pr. sag? (Spejler is_lead_active_status() i databasen.)
export function isActiveLead(status: LeadStatus): boolean {
  return (LEAD_ACTIVE_STATUSES as readonly string[]).includes(status);
}

// Er der plads til flere leads? Under 3 aktive og under 10 i alt (afviste og tilbagetrukne
// tæller ikke i de 3, men i de 10). Databasen er den endelige vogter (send_leads() og leads_before_insert()).
export function canSendMoreLeads(activeLeadCount: number, totalLeadCount = 0): boolean {
  return remainingLeadSlots(activeLeadCount, totalLeadCount) > 0;
}

// Hvor mange klinikker kan der højst sendes til nu? min(3 − aktive, 10 − i alt), aldrig under 0.
export function remainingLeadSlots(activeLeadCount: number, totalLeadCount: number): number {
  return Math.max(0, Math.min(MAX_ACTIVE_LEADS_PER_CASE - activeLeadCount, MAX_TOTAL_LEADS_PER_CASE - totalLeadCount));
}

// Kan sagen sendes videre til flere klinikker? Ikke lukket (en sendt sag kan sendes til flere, som i send_leads()),
// godkendt opsummering, postnummer, tidsrum og mindst én bekræftet ydelse, og plads til flere leads (aktive og i alt).
// Kontoen og samtykket tjekkes af send_leads().
export function canSendCase(
  record: Pick<CaseRecordDto, "status" | "summaryApprovedAt" | "postalCode" | "preferredTimeframe">,
  serviceCount: number,
  activeLeadCount: number,
  totalLeadCount: number,
): boolean {
  return (
    record.status !== "closed" &&
    record.summaryApprovedAt !== null &&
    record.postalCode !== null &&
    record.preferredTimeframe !== null &&
    serviceCount > 0 &&
    canSendMoreLeads(activeLeadCount, totalLeadCount)
  );
}
