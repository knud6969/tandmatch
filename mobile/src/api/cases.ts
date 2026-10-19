import type { z } from "zod";
import type { patchCaseSchema } from "@/lib/schemas/cases";
import type { ApproveSummaryResponse, SummaryResponse } from "@/lib/types/ai";
import type { CaseDto, CaseListItemDto } from "@/lib/types/cases";
import { apiRequest } from "./client";

// Sager (architecture 10.5).
export async function listCases(): Promise<CaseListItemDto[]> {
  const result = await apiRequest<{ cases: CaseListItemDto[] }>("/api/cases");
  return result.cases;
}

// Kun for patienter med konto; anonyme får deres sag via POST /api/session/anonymous.
export function createCase(): Promise<CaseDto> {
  return apiRequest<CaseDto>("/api/cases", { method: "POST", json: {} });
}

export function getCase(caseId: string): Promise<CaseDto> {
  return apiRequest<CaseDto>(`/api/cases/${caseId}`);
}

export function patchCase(caseId: string, input: z.infer<typeof patchCaseSchema>): Promise<CaseDto> {
  return apiRequest<CaseDto>(`/api/cases/${caseId}`, { method: "PATCH", json: input });
}

export type ConfirmedServiceInput = { serviceId: string; suggestedByAi: boolean };

export function putCaseServices(caseId: string, services: ConfirmedServiceInput[]): Promise<CaseDto> {
  return apiRequest<CaseDto>(`/api/cases/${caseId}/services`, { method: "PUT", json: { services } });
}

// Udkast til opsummering (kræver aktivt ai_processing-samtykke).
export function generateSummary(caseId: string): Promise<SummaryResponse> {
  return apiRequest<SummaryResponse>(`/api/cases/${caseId}/summary`, { method: "POST", json: {} });
}

export function approveSummary(caseId: string, summaryText: string): Promise<ApproveSummaryResponse> {
  return apiRequest<ApproveSummaryResponse>(`/api/cases/${caseId}/summary`, { method: "PUT", json: { summaryText } });
}
