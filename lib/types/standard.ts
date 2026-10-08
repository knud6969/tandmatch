import type { PriceRange, StandardService } from "@/lib/types/common";
import type { TrustpilotInfo } from "@/lib/types/dentists";

// Standard-sporet (architecture 10.8, 10.9). Ingen patientdata i nogen af typerne.
export type PriceAccuracy = "as_quoted" | "slightly_higher" | "much_higher";

export type ReviewStats = {
  reviewCount: number;
  avgStars: number | null;
  priceAccuracyPct: number | null; // null hvis < 3 godkendte anmeldelser
  distribution: { asQuoted: number | null; slightlyHigher: number | null; muchHigher: number | null }; // null under 3 godkendte
};

export type DentistListItemDto = {
  id: string;
  fullName: string;
  title: string | null;
  photoUrl: string | null;
  clinic: { id: string; name: string; address: string; postalCode: string; city: string; phone: string | null; website: string | null };
  distanceKm: number | null;
  nextAvailableAt: string | null; // null hvis ikke opdateret inden for 7 dage
  prices: { service: StandardService; price: PriceRange; note: string | null }[];
  trustpilot: TrustpilotInfo | null;
  reviewStats: ReviewStats;
};

export type DentistProfileDto = DentistListItemDto & {
  bio: string | null;
  acceptsCosmetic: boolean;
  cosmeticCategories: string[];
};

export type PublicReviewDto = {
  id: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  lackedTransparency: boolean | null;
  transparencyComment: string | null;
  verifiedVisit: true;
  createdMonth: string; // "2026-10"
  reply: { text: string; createdAt: string } | null; // kun godkendt svar
};

export type EligibleVisitDto = {
  visitId: string;
  dentistId: string;
  dentistName: string | null;
  clinicName: string | null;
  visitedOn: string;
  quotedPrice: PriceRange | null; // fra svaret, hvis besøget kom fra et svar
};

export type ModerationStatus = "pending" | "approved" | "rejected";

// GET /api/dentists/me/reviews: tandlægens egne anmeldelser inkl. afventende, og status på eget svar. Ingen patientidentitet.
export type DentistOwnReviewDto = {
  reviewId: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  lackedTransparency: boolean | null;
  transparencyComment: string | null;
  moderationStatus: ModerationStatus;
  createdAt: string;
  reply: { id: string; text: string; replyStatus: ModerationStatus } | null;
  replyStatus: ModerationStatus | "none";
};

// GET /api/reviews/mine: patientens egne anmeldelser med moderationsstatus.
export type OwnReviewDto = {
  id: string;
  visitId: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  moderationStatus: ModerationStatus;
  rejectionReason: string | null;
  createdAt: string;
};
