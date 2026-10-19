import { useMemo } from "react";
import type { CaseTimeframe } from "@/lib/types/cases";
import { approveSummary, confirmServices, createSummary, updateCase } from "~/api/cases";
import { getPatientMe } from "~/api/patients";
import { summaryAttemptFromError, summaryAttemptFromResponse, toServiceInputs, type SummaryAttempt } from "~/utils/case-cards";

// Handlingerne bag svar-kortene (architecture 7.9). Kortene får dem som props og kalder ikke API'et selv.
export type CaseActions = {
  confirmServices: (selected: string[], suggestedIds: string[]) => Promise<void>;
  setTimeframe: (value: CaseTimeframe) => Promise<void>;
  setPostalCode: (value: string) => Promise<void>;
  // Forsøger et udkast; fejl bliver til "skriv selv" i stedet for at kaste.
  generateSummary: () => Promise<SummaryAttempt>;
  approveSummary: (text: string) => Promise<void>;
  // Postnummeret fra patientens profil (kun patienter med konto); null hvis det ikke kan hentes.
  profilePostalCode: () => Promise<string | null>;
};

export function useCaseActions(caseId: string): CaseActions {
  return useMemo(
    () => ({
      confirmServices: async (selected, suggestedIds) => {
        await confirmServices(caseId, toServiceInputs(selected, suggestedIds));
      },
      setTimeframe: async (value) => {
        await updateCase(caseId, { preferredTimeframe: value });
      },
      setPostalCode: async (value) => {
        await updateCase(caseId, { postalCode: value });
      },
      generateSummary: async () => {
        try {
          return summaryAttemptFromResponse(await createSummary(caseId));
        } catch (error) {
          return summaryAttemptFromError(error);
        }
      },
      approveSummary: async (text) => {
        await approveSummary(caseId, text);
      },
      profilePostalCode: async () => {
        try {
          return (await getPatientMe()).postalCode;
        } catch {
          return null; // Forudfyldning er en hjælp; mangler den, skriver patienten selv.
        }
      },
    }),
    [caseId],
  );
}
