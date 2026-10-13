// Anmeldelsesstatistik (architecture 8.3, 10.1). Udvides i trin 2 og 6 med anmeldelserne selv.
export type ReviewStats = {
  reviewCount: number;
  avgStars: number | null;
  priceAccuracyPct: number | null;
  distribution: { asQuoted: number; slightlyHigher: number; muchHigher: number } | null;
};
