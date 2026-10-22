import type { PriceRange } from "@/lib/common/types/common";
import type { MODERATION_STATUSES, PRICE_ACCURACY_VALUES } from "@/lib/constants/reviews";

// Anmeldelsesstatistik (architecture 8.3, 10.1). Anmeldelserne selv står nedenfor.
export type ReviewStats = {
  reviewCount: number;
  avgStars: number | null;
  priceAccuracyPct: number | null;
  distribution: { asQuoted: number; slightlyHigher: number; muchHigher: number } | null;
};

export type PriceAccuracy = (typeof PRICE_ACCURACY_VALUES)[number];
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

// Godkendt anmeldelse som den vises offentligt (architecture 10.13). Anmelderen vises aldrig.
export type PublicReviewDto = {
  id: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  lackedTransparency: boolean | null;
  transparencyComment: string | null;
  verifiedVisit: true;
  createdMonth: string;
  reply: { text: string; createdAt: string } | null;
};

// GET /api/clinics/{id}/reviews (architecture 10.7).
export type PublicReviewsDto = { stats: ReviewStats; reviews: PublicReviewDto[] };

// GET /api/reviews/eligible (architecture 10.13): gennemførte besøg, patienten endnu ikke har anmeldt.
export type ReviewEligibleItemDto = {
  bookingId: string;
  clinicId: string;
  clinicName: string;
  serviceName: string;
  visitedOn: string; // "YYYY-MM-DD" i dansk tid
  priceEstimate: PriceRange | null; // præciseret pris, ellers listepris (8.2)
};

// GET /api/reviews/mine: patientens egen anmeldelse med moderationsstatus. `reply` er kun med, når svaret er godkendt.
export type OwnReviewDto = PublicReviewDto & {
  bookingId: string;
  clinic: { id: string; name: string };
  moderationStatus: ModerationStatus;
  rejectionReason: string | null;
};

// GET /api/clinics/me/reviews: godkendte anmeldelser af egen klinik. `reply` er klinikkens eget svar uanset status.
export type ClinicReviewDto = PublicReviewDto & { replyStatus: ModerationStatus | null };

// POST /api/reviews og POST /api/reviews/{id}/reply: nye rækker er altid `pending` (8.5).
export type ReviewCreatedDto = { id: string; moderationStatus: ModerationStatus };

// Dataeksporten (architecture 10.2): patientens egne anmeldelser. Klinikkens navn står i `bookings` (samme `bookingId`).
export type ReviewExportDto = {
  id: string;
  bookingId: string;
  clinicId: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  lackedTransparency: boolean | null;
  transparencyComment: string | null;
  moderationStatus: ModerationStatus;
  rejectionReason: string | null;
  createdAt: string;
};
