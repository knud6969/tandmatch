import type { ChatExportDto } from "@/lib/types/ai";
import type { BookingExportDto } from "@/lib/types/bookings";
import type { CaseExportDto } from "@/lib/types/cases";
import type { ConsentDto } from "@/lib/identity/types/consents";
import type { LeadExportDto } from "@/lib/types/leads";
import type { ReviewExportDto } from "@/lib/types/reviews";

export type PatientMeDto = { firstName: string | null; postalCode: string | null; phone: string | null };

// Dataeksport (GDPR art. 15/20, architecture 10.2): { exportedAt, cases, chat, leads, bookings, reviews, consents }.
export type PatientExportDto = {
  exportedAt: string;
  cases: CaseExportDto[];
  chat: ChatExportDto[]; // egne AI-samtaler pr. sag
  leads: LeadExportDto[];
  bookings: BookingExportDto[];
  reviews: ReviewExportDto[];
  consents: ConsentDto[];
};
