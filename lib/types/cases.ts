import type { CASE_FLOW_STEPS } from "@/lib/constants/case-flow";
import type { CASE_STATUSES, CASE_TIMEFRAMES } from "@/lib/constants/cases";
import type { AiSummary } from "@/lib/types/ai";
import type { ImageDto } from "@/lib/common/types/common";
import type { LeadStatus } from "@/lib/types/leads";
import type { ServiceDto } from "@/lib/types/services";

// Sager (architecture 4.3 `cases`, 10.5). Udvides i trin 2 med CaseDto m.fl.
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CaseTimeframe = (typeof CASE_TIMEFRAMES)[number];
// Trin i appens samtaleflow (architecture 7.9).
export type CaseFlowStep = (typeof CASE_FLOW_STEPS)[number];

// Sagens egne felter, som de står i databasen (camelCase).
export type CaseRecordDto = {
  id: string;
  status: CaseStatus;
  isEmergency: boolean;
  postalCode: string | null;
  preferredTimeframe: CaseTimeframe | null;
  aiSummary: AiSummary | null; // zod-parset i CasesRepository (ugyldigt → null)
  summaryText: string | null;
  summaryAiAssisted: boolean;
  summaryApprovedAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

// Sag i dataeksporten (GDPR art. 15/20): sagens felter, bekræftede ydelser og billedernes metadata (ikke filerne).
export type CaseExportDto = CaseRecordDto & {
  services: { serviceId: string; suggestedByAi: boolean; confirmedAt: string }[];
  images: { id: string; view: string | null; quality: string | null; description: string | null; createdAt: string }[];
};

// Sagen, som patienten ser den (architecture 10.5). Billederne har friske, signerede URL'er.
export type CaseDto = {
  id: string;
  status: CaseStatus;
  isEmergency: boolean;
  postalCode: string | null;
  preferredTimeframe: CaseTimeframe | null;
  services: (ServiceDto & { suggestedByAi: boolean })[]; // bekræftede
  suggestedServices: ServiceDto[]; // seneste AI-forslag, ikke bekræftet
  images: ImageDto[];
  hasConversation: boolean;
  aiSummary: AiSummary | null;
  summaryText: string | null;
  summaryApprovedAt: string | null;
  submittedAt: string | null;
  leadCount: number; // aktive leads (sammen med totalLeadCount giver det remainingLeadSlots() uden at hente leads)
  totalLeadCount: number; // alle leads på sagen, også afviste og tilbagetrukne
  canSend: boolean;
};

export type CaseListItemDto = {
  id: string;
  status: CaseStatus;
  isEmergency: boolean;
  serviceNames: string[];
  submittedAt: string | null;
  leads: { id: string; clinicName: string; status: LeadStatus; removed: boolean }[];
  nextBooking: { startsAt: string; clinicName: string } | null;
};

// Samtalen og seneste AI-forslag på en sag (læses med patientens JWT).
export type CaseConversationInfo = { hasConversation: boolean; suggestedServiceIds: string[] };
