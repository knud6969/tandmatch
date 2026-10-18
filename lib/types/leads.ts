import type { LEAD_DECLINE_REASONS, LEAD_STATUSES } from "@/lib/constants/leads";
import type { ClinicBookingDto, PatientBookingDto } from "@/lib/types/bookings";
import type { CaseTimeframe } from "@/lib/types/cases";
import type { ImageDto, PriceRange } from "@/lib/types/common";
import type { ServiceDto } from "@/lib/types/services";

// Leads (architecture 4.3, 10.9).
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadDeclineReason = (typeof LEAD_DECLINE_REASONS)[number]; // clinic_left: "Klinikken er ikke længere på TandMatch"

// Lead, som patienten ser det. Klinikken kommer fra patient_lead_clinics() (patienter har ingen SELECT på clinics).
export type PatientLeadDto = {
  id: string;
  clinic: {
    id: string;
    name: string;
    city: string;
    logoUrl: string | null;
    removed: boolean; // true: UI viser "Klinikken er ikke længere på TandMatch"; logoUrl er null
  };
  status: LeadStatus;
  sentAt: string;
  respondedAt: string | null;
  listPrice: PriceRange | null;
  quotedPrice: PriceRange | null;
  clinicComment: string | null;
  declineReason: LeadDeclineReason | null;
  declineNote: string | null; // klinikkens egen tekst til afvisningen (højst 200 tegn)
  booking: PatientBookingDto | null; // aktiv eller seneste; null uden booking
  unreadMessages: number;
};

// Lead i dataeksporten (GDPR art. 15/20): patientens egne leads med klinikkens navn, uden billeder og beskedtekster.
export type LeadExportDto = {
  id: string;
  caseId: string;
  clinicId: string;
  clinicName: string;
  status: LeadStatus;
  sentAt: string;
  respondedAt: string | null;
  withdrawnAt: string | null;
  listPrice: PriceRange | null;
  quotedPrice: PriceRange | null;
  clinicComment: string | null;
  declineReason: LeadDeclineReason | null;
};

// Lead, som klinikken ser det (architecture 4.4, 5.7, 10.9). Ingen patientidentitet: hverken navn, kontakt, id eller sags-id.
// For et tilbagetrukket lead er kun id, status, sentAt og withdrawnAt udfyldt; resten er tomme værdier (false, [], null, 0).
export type ClinicLeadListItemDto = {
  id: string;
  status: LeadStatus;
  isEmergency: boolean;
  serviceNames: string[];
  area: { postalCode: string | null; city: string | null };
  distanceKm: number | null;
  preferredTimeframe: CaseTimeframe | null;
  requestedStartsAt: string | null;
  imageCount: number;
  sentAt: string;
  seenAt: string | null;
  withdrawnAt: string | null;
  unreadMessages: number;
};

// Ydelsen, som klinikken ser den på et lead (clinic_lead_detail() returnerer ikke varighed og kategori-id).
export type ClinicLeadServiceDto = Pick<ServiceDto, "id" | "slug" | "name" | "description" | "category">;

export type ClinicLeadDetailDto = ClinicLeadListItemDto & {
  services: ClinicLeadServiceDto[];
  summaryText: string;
  summaryAiAssisted: boolean;
  images: (ImageDto & { approvedDescription: string | null })[];
  listPrice: PriceRange | null;
  decision: {
    comment: string | null;
    quotedPrice: PriceRange | null;
    declineReason: LeadDeclineReason | null;
    declineNote: string | null;
    respondedAt: string;
  } | null;
  booking: ClinicBookingDto | null;
};

// POST /api/emergency-leads (architecture 10.11). lead.booking.status er altid "held".
export type EmergencyLeadCreatedDto = { caseId: string; lead: PatientLeadDto };
