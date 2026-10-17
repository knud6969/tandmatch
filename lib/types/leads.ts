import type { LEAD_DECLINE_REASONS, LEAD_STATUSES } from "@/lib/constants/leads";
import type { PriceRange } from "@/lib/types/common";

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
  booking: null; // PatientBookingDto kommer med trin 6.1
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
