import type { ChatExportDto } from "@/lib/types/ai";
import type { CaseExportDto } from "@/lib/types/cases";
import type { ConsentDto } from "@/lib/types/consents";

export type PatientMeDto = { firstName: string | null; postalCode: string | null };

// Dataeksport (GDPR art. 15/20, architecture 10.2): { exportedAt, cases, chat, leads, bookings, reviews, consents }.
// [IKKE BYGGET] leads (trin 4), bookings (trin 6) og reviews (trin 6) tilføjes, når deres repositories findes.
export type PatientExportDto = {
  exportedAt: string;
  cases: CaseExportDto[];
  chat: ChatExportDto[]; // egne AI-samtaler pr. sag
  consents: ConsentDto[];
};
