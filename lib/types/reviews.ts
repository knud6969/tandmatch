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
