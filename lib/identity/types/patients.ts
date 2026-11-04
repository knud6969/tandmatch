import type { ChatExportDto } from "@/lib/cases/types/ai";
import type { BookingExportDto } from "@/lib/booking/types/bookings";
import type { CaseExportDto } from "@/lib/cases/types/cases";
import type { ConsentDto } from "@/lib/identity/types/consents";
import type { FavoriteExportDto } from "@/lib/clinics/types/favorites";
import type { LeadExportDto } from "@/lib/leads/types/leads";
import type { PushDeviceExportDto } from "@/lib/identity/types/push-tokens";
import type { ReviewExportDto } from "@/lib/booking/types/reviews";

export type PatientMeDto = { firstName: string | null; postalCode: string | null; phone: string | null };

// Dataeksport (GDPR art. 15/20, architecture 10.2): { exportedAt, cases, chat, leads, bookings, reviews, consents, favorites, pushDevices }.
export type PatientExportDto = {
  exportedAt: string;
  cases: CaseExportDto[];
  chat: ChatExportDto[]; // egne AI-samtaler pr. sag
  leads: LeadExportDto[];
  bookings: BookingExportDto[];
  reviews: ReviewExportDto[];
  consents: ConsentDto[];
  favorites: FavoriteExportDto[]; // gemte klinikker
  pushDevices: PushDeviceExportDto[]; // enhedernes platform og tidspunkter, aldrig tokenet
};
