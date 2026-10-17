"use client";

import { useCallback } from "react";
import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";
import { canSendMoreLeads, isActiveLead } from "@/lib/domain/leads";
import type { CaseDto } from "@/lib/types/cases";
import type { PatientLeadDto } from "@/lib/types/leads";
import { apiRequest } from "@/views/utils/api-client";
import { useLoad } from "@/views/utils/use-load";

export type CaseSelectionContext = {
  caseDto: CaseDto;
  leads: PatientLeadDto[];
  // Klinikker, sagen allerede har (eller har haft) et lead til. En klinik kan kun kontaktes én gang pr. sag.
  contactedIds: string[];
  activeCount: number;
  // Hvor mange klinikker der højst kan vælges nu: 3 minus sagens aktive leads (0 ved samlet loft).
  slots: number;
};

// Sagen og dens leads. Regnestykket for pladser kommer fra lib/domain/leads.ts.
export async function loadCaseSelection(caseId: string): Promise<CaseSelectionContext> {
  const [caseDto, { leads }] = await Promise.all([
    apiRequest<CaseDto>(`/api/cases/${caseId}`),
    apiRequest<{ leads: PatientLeadDto[] }>(`/api/cases/${caseId}/leads`),
  ]);
  const activeCount = leads.filter((lead) => isActiveLead(lead.status)).length;
  const open = canSendMoreLeads(activeCount, leads.length);
  return {
    caseDto,
    leads,
    contactedIds: leads.map((lead) => lead.clinic.id),
    activeCount,
    slots: open ? MAX_ACTIVE_LEADS_PER_CASE - activeCount : 0,
  };
}

// Når patienten vælger klinikker (?sag=). Uden sag hentes intet.
export function useCaseSelection(caseId: string | null) {
  const loader = useCallback(async () => (caseId ? loadCaseSelection(caseId) : null), [caseId]);
  return useLoad(loader);
}
