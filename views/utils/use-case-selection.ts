"use client";

import { useCallback, useMemo, useState } from "react";
import { MAX_TOTAL_LEADS_PER_CASE } from "@/lib/constants/limits";
import { remainingLeadSlots } from "@/lib/domain/leads";
import type { CaseDto } from "@/lib/types/cases";
import type { PatientLeadDto } from "@/lib/types/leads";
import { apiRequest } from "@/views/utils/api-client";
import { readSelection, writeSelection, type CompareChoice } from "@/views/utils/compare-selection";
import { useLoad } from "@/views/utils/use-load";

export type CaseSelectionContext = {
  caseDto: CaseDto;
  leads: PatientLeadDto[];
  // Klinikker, sagen allerede har (eller har haft) et lead til. En klinik kan kun kontaktes én gang pr. sag.
  contactedIds: string[];
  // Sagens aktive leads (fra serveren).
  activeCount: number;
  // Hvor mange klinikker der højst kan vælges nu (lib/domain/leads.ts: aktive og i alt tages med).
  slots: number;
  // Er loftet for leads i alt nået? Så hjælper det ikke at trække en henvendelse tilbage.
  totalLimitReached: boolean;
};

// Teksten, når der ikke er flere pladser. Ved loftet i alt skal patienten starte en ny sag, ellers kan en tilbagetrækning give plads.
export function noSlotsText(totalLimitReached: boolean): string {
  return totalLimitReached
    ? `Din sag er allerede sendt til ${MAX_TOTAL_LEADS_PER_CASE} klinikker, som er det højeste antal pr. sag. Start en ny samtale, hvis du har brug for flere.`
    : "Sagen har nået loftet for, hvor mange klinikker den kan sendes til lige nu. Trækker du en henvendelse tilbage, kan der blive plads.";
}

// Sagen og dens leads. Tallene kommer fra serveren (leadCount, totalLeadCount, canSend).
export async function loadCaseSelection(caseId: string): Promise<CaseSelectionContext> {
  const [caseDto, { leads }] = await Promise.all([
    apiRequest<CaseDto>(`/api/cases/${caseId}`),
    apiRequest<{ leads: PatientLeadDto[] }>(`/api/cases/${caseId}/leads`),
  ]);
  return {
    caseDto,
    leads,
    contactedIds: leads.map((lead) => lead.clinic.id),
    activeCount: caseDto.leadCount,
    slots: remainingLeadSlots(caseDto.leadCount, caseDto.totalLeadCount),
    totalLimitReached: caseDto.totalLeadCount >= MAX_TOTAL_LEADS_PER_CASE,
  };
}

// Når patienten vælger klinikker (?sag=). Uden sag hentes intet.
export function useCaseSelection(caseId: string | null) {
  const loader = useCallback(async () => (caseId ? loadCaseSelection(caseId) : null), [caseId]);
  return useLoad(loader);
}

// Patientens valg af klinikker til en sag: henter sagen, filtrerer allerede kontaktede fra, beskærer til ledige pladser
// og husker valget i sessionStorage (oversigten og profilen deler det).
export function useCaseChoices(caseId: string | null) {
  const state = useCaseSelection(caseId);
  const [picked, setPicked] = useState<CompareChoice[]>(() => (caseId ? readSelection(caseId) : []));
  const sag = state.data;

  const chosen = useMemo(
    () => (sag ? picked.filter((choice) => !sag.contactedIds.includes(choice.id)).slice(0, sag.slots) : []),
    [picked, sag],
  );
  const slots = sag?.slots ?? 0;
  // Kan patienten vælge klinikker nu? Sagen skal kunne sendes (serverens canSend, som også tager højde for lofterne).
  const canChoose = sag !== null && sag.caseDto.canSend && slots > 0;

  const save = useCallback(
    (next: CompareChoice[]) => {
      setPicked(next);
      if (caseId) writeSelection(caseId, next);
    },
    [caseId],
  );
  const isChosen = (id: string) => chosen.some((choice) => choice.id === id);
  const remove = (id: string) => save(chosen.filter((choice) => choice.id !== id));
  const toggle = (choice: CompareChoice) => {
    if (isChosen(choice.id)) return remove(choice.id);
    if (chosen.length >= slots) return;
    save([...chosen, choice]);
  };

  return { state, sag, chosen, slots, canChoose, full: chosen.length >= slots, isChosen, toggle, remove };
}
