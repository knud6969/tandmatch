import type { CosmeticCategory, ImageDto, RequestStatus } from "@/lib/types/common";

// Tandlægens egne DTO'er (architecture 10.6, 10.8). Ingen patientdata i nogen af dem.

export type TrustpilotInfo = {
  url: string | null;
  score: number | null; // 1.0-5.0, angivet af klinikken
  reviewCount: number | null;
  updatedAt: string | null; // vises som "Angivet af klinikken d. ..."
};

export type ClinicDto = {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string | null;
  website: string | null;
  trustpilot: TrustpilotInfo;
};

// GET/PATCH /api/dentists/me. isVerified skal vises i profilen: ikke-verificerede kan ikke modtage forespørgsler eller svare.
export type DentistMeDto = {
  id: string;
  fullName: string;
  title: string | null;
  bio: string | null;
  photoUrl: string | null; // fotoupload er ikke bygget endnu (trin 5)
  isActive: boolean;
  acceptsCosmetic: boolean;
  cosmeticCategories: CosmeticCategory[];
  nextAvailableAt: string | null;
  nextAvailableUpdatedAt: string | null;
  isVerified: boolean;
  authorizationId: string;
  clinic: ClinicDto | null; // null indtil tandlægen har oprettet en klinik (PATCH /api/clinics/me)
};

export type InboxRecipientStatus = "new" | "seen" | "responded" | "declined";

export type InboxItemDto = {
  requestId: string;
  category: CosmeticCategory;
  area: { postalCode: string; city: string | null };
  distanceKm: number;
  imageCount: number;
  recipientStatus: InboxRecipientStatus;
  requestStatus: RequestStatus;
  sentAt: string;
  expiresAt: string;
};

// Detalje for én modtaget forespørgsel (architecture 10.6). Ingen patient_id, navn eller kontaktinfo.
export type InboxDetailDto = {
  requestId: string;
  category: CosmeticCategory;
  area: { postalCode: string | null; city: string | null };
  distanceKm: number;
  status: RequestStatus;
  sentAt: string | null;
  expiresAt: string | null;
  summaryText: string | null; // kun når patienten har godkendt opsummeringen
  answers: { label: string; values: string[] }[];
  images: ImageDto[]; // signerede URL'er, 5 min
};
