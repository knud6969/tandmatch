import type { CLINIC_SORTS, CLINIC_STATUSES, CLINIC_TIERS, WEEKDAYS } from "@/lib/constants/clinics";
import type { PriceRange, TrustpilotInfo } from "@/lib/types/common";
import type { ReviewStats } from "@/lib/types/reviews";

export type ClinicStatus = (typeof CLINIC_STATUSES)[number];
export type ClinicTier = (typeof CLINIC_TIERS)[number];
export type Weekday = (typeof WEEKDAYS)[number];
export type ClinicSort = (typeof CLINIC_SORTS)[number];

// Kort om brugerens egen klinik, vist i GET /api/me (architecture 10.2).
export type ClinicSummaryDto = { id: string; name: string; status: ClinicStatus };

export type OpeningHoursDto = { weekday: Weekday; opensAt: string; closesAt: string; isEmergency: boolean };

export type ClinicPriceDto = {
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  price: PriceRange;
  durationMin: number;
  note: string | null;
};

export type TimeBlockDto = { id: string; startsAt: string; endsAt: string; note: string | null };

// Porteføljebillede og tandlæge som de vises på profilen (architecture 10.7).
export type PublicPortfolioItemDto = { id: string; imageUrl: string; caption: string | null; serviceName: string | null };
export type ClinicProfileDentistDto = {
  id: string;
  fullName: string;
  title: string | null;
  bio: string | null;
  photoUrl: string | null;
  portfolio: PublicPortfolioItemDto[];
};

// Klinikkens egne rækker til redigering (architecture 10.8).
export type PortfolioItemDto = PublicPortfolioItemDto & {
  dentistId: string;
  serviceId: string | null;
  patientConsentConfirmedAt: string;
};
export type DentistDto = ClinicProfileDentistDto & { sortOrder: number; portfolio: PortfolioItemDto[] };
// Tandlægen uden portefølje, som repositoriet læser den; porteføljen lægges på af attachPortfolio() (lib/domain/dentists.ts).
export type DentistRecordDto = Omit<DentistDto, "portfolio">;

// Klinikkens egne felter, som repositoriet læser dem (camelCase). `logoPath` bruges kun på serveren.
export type ClinicRecordDto = {
  id: string;
  status: ClinicStatus;
  cvr: string | null;
  name: string;
  description: string | null;
  address: string;
  postalCode: string;
  city: string;
  location: { lat: number; lng: number } | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoPath: string | null;
  logoUpdatedAt: string | null;
  trustpilot: TrustpilotInfo;
  updatedAt: string;
};

export type ClinicListItemDto = {
  id: string;
  name: string;
  tier: ClinicTier;
  canReceiveLeads: boolean; // status === "verified"
  address: string;
  postalCode: string;
  city: string;
  location: { lat: number; lng: number } | null;
  phone: string | null;
  website: string | null;
  openingHours: OpeningHoursDto[];
  distanceKm: number | null;
  trustpilot: TrustpilotInfo; // alle niveauer, når kendt
  // Kun tier "full", ellers null/[]
  reviewStats: ReviewStats | null;
  logoUrl: string | null;
  prices: ClinicPriceDto[];
  priceForSelection: PriceRange | null;
  firstAvailableAt: string | null;
  firstEmergencyAt: string | null;
};

export type ClinicProfileDto = ClinicListItemDto & {
  description: string | null;
  email: string | null;
  allPrices: ClinicPriceDto[];
  dentists: ClinicProfileDentistDto[];
};

// GET/PATCH /api/clinics/me: forhåndsvisning af den fulde profil uanset status (architecture 10.8).
export type OwnClinicDto = ClinicProfileDto & { status: ClinicStatus; cvr: string; dentists: DentistDto[] };

// GET /api/clinics: sorteret og filtreret af RankingService (architecture 6.6, 10.7). `criteria` er de kriterier,
// patienten ser ved listen.
export type ClinicListDto = { clinics: ClinicListItemDto[]; sort: ClinicSort; criteria: string[] };

// En ledig tid (architecture 6.7, 10.7). Tidspunkter som ISO 8601 (UTC).
export type SlotDto = { startsAt: string; endsAt: string };

// En klinik som public_clinics()/public_clinic_profile() viser den, før controlleren har lagt afstand, anmeldelsesstatistik,
// pris for valget og første ledige tid på (architecture 10.7). `prices` er alle priser for de forespurgte behandlinger.
export type PublicClinicRecord = Omit<
  ClinicListItemDto,
  "distanceKm" | "reviewStats" | "priceForSelection" | "firstAvailableAt" | "firstEmergencyAt"
>;
export type PublicClinicProfileRecord = PublicClinicRecord & Pick<ClinicProfileDto, "description" | "email" | "allPrices" | "dentists">;
