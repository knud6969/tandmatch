import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StandardService } from "@/lib/types/common";
import type { PriceAccuracy, ReviewStats } from "@/lib/types/standard";
import { notFound } from "@/middleware/http";

// Offentlig læsning. Tandlæger læses via public_dentists() (security definer), ikke direkte, fordi anon ikke må læse dentists.
// Kolonnenavne forlader ikke denne fil.

export type PublicDentistRow = {
  dentistId: string;
  fullName: string;
  title: string | null;
  bio: string | null;
  photoPath: string | null;
  acceptsCosmetic: boolean;
  cosmeticCategories: string[];
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  clinicPostalCode: string;
  clinicCity: string;
  phone: string | null;
  website: string | null;
  trustpilotUrl: string | null;
  trustpilotScore: number | null;
  trustpilotReviewCount: number | null;
  trustpilotUpdatedAt: string | null;
  nextAvailableAt: string | null;
  distanceKm: number | null;
};

type PublicDentistDbRow = {
  dentist_id: string;
  full_name: string;
  title: string | null;
  bio: string | null;
  photo_path: string | null;
  accepts_cosmetic: boolean;
  cosmetic_categories: string[];
  clinic_id: string;
  clinic_name: string;
  clinic_address: string;
  clinic_postal_code: string;
  clinic_city: string;
  phone: string | null;
  website: string | null;
  trustpilot_url: string | null;
  trustpilot_score: number | string | null;
  trustpilot_review_count: number | null;
  trustpilot_updated_at: string | null;
  next_available_at: string | null;
  distance_km: number | string | null;
};

function toPublicDentist(row: PublicDentistDbRow): PublicDentistRow {
  return {
    dentistId: row.dentist_id,
    fullName: row.full_name,
    title: row.title,
    bio: row.bio,
    photoPath: row.photo_path,
    acceptsCosmetic: row.accepts_cosmetic,
    cosmeticCategories: row.cosmetic_categories ?? [],
    clinicId: row.clinic_id,
    clinicName: row.clinic_name,
    clinicAddress: row.clinic_address,
    clinicPostalCode: row.clinic_postal_code,
    clinicCity: row.clinic_city,
    phone: row.phone,
    website: row.website,
    trustpilotUrl: row.trustpilot_url,
    trustpilotScore: row.trustpilot_score === null ? null : Number(row.trustpilot_score),
    trustpilotReviewCount: row.trustpilot_review_count,
    trustpilotUpdatedAt: row.trustpilot_updated_at,
    nextAvailableAt: row.next_available_at,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
  };
}

export async function listPublicDentists(
  supabase: SupabaseClient,
  postalCode: string | null,
): Promise<PublicDentistRow[]> {
  const { data, error } = await supabase.rpc("public_dentists", { p_postal_code: postalCode, p_dentist_id: null });
  if (error) throw new Error("public_dentists fejlede");
  return ((data ?? []) as unknown as PublicDentistDbRow[]).map(toPublicDentist);
}

export async function getPublicDentist(supabase: SupabaseClient, dentistId: string): Promise<PublicDentistRow> {
  const { data, error } = await supabase.rpc("public_dentists", { p_postal_code: null, p_dentist_id: dentistId });
  if (error) throw new Error("public_dentists fejlede");
  const row = (data as unknown as PublicDentistDbRow[] | null)?.[0];
  if (!row) throw notFound();
  return toPublicDentist(row);
}

export type PriceRow = { clinicId: string; service: StandardService; priceMin: number; priceMax: number; note: string | null };

export async function listPricesForClinics(supabase: SupabaseClient, clinicIds: string[]): Promise<PriceRow[]> {
  if (clinicIds.length === 0) return [];
  const { data, error } = await supabase
    .from("clinic_prices")
    .select("clinic_id, service, price_min, price_max, note")
    .in("clinic_id", clinicIds);
  if (error) throw new Error("clinic_prices: select fejlede");
  return ((data ?? []) as { clinic_id: string; service: StandardService; price_min: number; price_max: number; note: string | null }[]).map(
    (row) => ({
      clinicId: row.clinic_id,
      service: row.service,
      priceMin: row.price_min,
      priceMax: row.price_max,
      note: row.note,
    }),
  );
}

export type PublicReviewRow = {
  reviewId: string;
  stars: number;
  text: string;
  priceAccuracy: PriceAccuracy;
  actualPrice: number | null;
  lackedTransparency: boolean | null;
  transparencyComment: string | null;
  createdMonth: string;
  replyText: string | null;
  replyCreatedAt: string | null;
};

export async function listPublicReviews(supabase: SupabaseClient, dentistId: string): Promise<PublicReviewRow[]> {
  const { data, error } = await supabase.rpc("public_reviews", { p_dentist_id: dentistId });
  if (error) throw new Error("public_reviews fejlede");
  return (
    (data ?? []) as unknown as {
      review_id: string;
      stars: number;
      text: string;
      price_accuracy: PriceAccuracy;
      actual_price: number | null;
      lacked_transparency: boolean | null;
      transparency_comment: string | null;
      created_month: string;
      reply_text: string | null;
      reply_created_at: string | null;
    }[]
  ).map((row) => ({
    reviewId: row.review_id,
    stars: row.stars,
    text: row.text,
    priceAccuracy: row.price_accuracy,
    actualPrice: row.actual_price,
    lackedTransparency: row.lacked_transparency,
    transparencyComment: row.transparency_comment,
    createdMonth: row.created_month,
    replyText: row.reply_text,
    replyCreatedAt: row.reply_created_at,
  }));
}

type StatsDbRow = {
  dentist_id: string;
  review_count: number;
  avg_stars: number | string | null;
  price_accuracy_pct: number | null;
  n_as_quoted: number | null;
  n_slightly_higher: number | null;
  n_much_higher: number | null;
};

function toStats(row: StatsDbRow | undefined): ReviewStats {
  if (!row) {
    return { reviewCount: 0, avgStars: null, priceAccuracyPct: null, distribution: { asQuoted: null, slightlyHigher: null, muchHigher: null } };
  }
  return {
    reviewCount: row.review_count,
    avgStars: row.avg_stars === null ? null : Number(row.avg_stars),
    priceAccuracyPct: row.price_accuracy_pct,
    distribution: { asQuoted: row.n_as_quoted, slightlyHigher: row.n_slightly_higher, muchHigher: row.n_much_higher },
  };
}

// Statistik for mange tandlæger i ét kald (ingen N+1).
export async function getPublicReviewStatsMany(
  supabase: SupabaseClient,
  dentistIds: string[],
): Promise<Map<string, ReviewStats>> {
  const result = new Map<string, ReviewStats>();
  if (dentistIds.length === 0) return result;
  const { data, error } = await supabase.rpc("public_dentist_review_stats_many", { p_dentist_ids: dentistIds });
  if (error) throw new Error("public_dentist_review_stats_many fejlede");
  const rows = (data ?? []) as unknown as StatsDbRow[];
  for (const id of dentistIds) {
    result.set(id, toStats(rows.find((r) => r.dentist_id === id)));
  }
  return result;
}

export async function getPublicReviewStats(supabase: SupabaseClient, dentistId: string): Promise<ReviewStats> {
  const map = await getPublicReviewStatsMany(supabase, [dentistId]);
  return map.get(dentistId) ?? toStats(undefined);
}
