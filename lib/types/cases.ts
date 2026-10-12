import type { CASE_STATUSES, CASE_TIMEFRAMES } from "@/lib/constants/cases";

// Sager (architecture 4.3 `cases`, 10.5). Udvides i trin 2 med CaseDto m.fl.
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CaseTimeframe = (typeof CASE_TIMEFRAMES)[number];

// Sagens egne felter, som de står i databasen (camelCase).
export type CaseRecordDto = {
  id: string;
  status: CaseStatus;
  isEmergency: boolean;
  postalCode: string | null;
  preferredTimeframe: CaseTimeframe | null;
  aiSummary: unknown | null;
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
