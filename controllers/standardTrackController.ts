import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StandardService } from "@/lib/types/common";
import type { DentistListItemDto, DentistProfileDto, PublicReviewDto, ReviewStats } from "@/lib/types/standard";
import {
  getPublicDentist,
  getPublicReviewStats,
  getPublicReviewStatsMany,
  listPricesForClinics,
  listPublicDentists,
  listPublicReviews,
  type PublicDentistRow,
  type PriceRow,
} from "@/models/standardModel";

// Standard-sporet: offentlig tandlægeliste og profil (architecture 10.8). Kun verificerede og aktive tandlæger.
// Ingen patientdata. Trustpilot vises kun som angivet af klinikken (8.4). Platformens anmeldelser holdes adskilt.

function toListItem(row: PublicDentistRow, prices: PriceRow[], stats: ReviewStats): DentistListItemDto {
  return {
    id: row.dentistId,
    fullName: row.fullName,
    title: row.title,
    photoUrl: null, // offentlig bucket public-profile er ikke bygget endnu
    clinic: {
      id: row.clinicId,
      name: row.clinicName,
      address: row.clinicAddress,
      postalCode: row.clinicPostalCode,
      city: row.clinicCity,
      phone: row.phone,
      website: row.website,
    },
    distanceKm: row.distanceKm,
    nextAvailableAt: row.nextAvailableAt,
    prices: prices.map((p) => ({ service: p.service, price: { min: p.priceMin, max: p.priceMax }, note: p.note })),
    trustpilot: row.trustpilotUrl
      ? {
          url: row.trustpilotUrl,
          score: row.trustpilotScore,
          reviewCount: row.trustpilotReviewCount,
          updatedAt: row.trustpilotUpdatedAt,
        }
      : null,
    reviewStats: stats,
  };
}

// Liste sorteret efter afstand (nærmeste først). Med ydelse: kun tandlæger med en pris for den ydelse.
export async function listStandardDentists(
  supabase: SupabaseClient,
  postalCode: string | undefined,
  service: StandardService | undefined,
): Promise<DentistListItemDto[]> {
  const rows = await listPublicDentists(supabase, postalCode ?? null);
  const prices = await listPricesForClinics(supabase, [...new Set(rows.map((r) => r.clinicId))]);
  const statsById = await getPublicReviewStatsMany(supabase, [...new Set(rows.map((r) => r.dentistId))]);
  const items: DentistListItemDto[] = [];
  for (const row of rows) {
    const clinicPrices = prices.filter((p) => p.clinicId === row.clinicId);
    if (service && !clinicPrices.some((p) => p.service === service)) continue;
    const stats = statsById.get(row.dentistId) ?? (await getPublicReviewStats(supabase, row.dentistId));
    items.push(toListItem(row, clinicPrices, stats));
  }
  return items;
}

export async function getStandardDentistProfile(supabase: SupabaseClient, dentistId: string): Promise<DentistProfileDto> {
  const row = await getPublicDentist(supabase, dentistId);
  const prices = await listPricesForClinics(supabase, [row.clinicId]);
  const stats = await getPublicReviewStats(supabase, row.dentistId);
  return {
    ...toListItem(row, prices, stats),
    bio: row.bio,
    acceptsCosmetic: row.acceptsCosmetic,
    cosmeticCategories: row.cosmeticCategories,
  };
}

// Godkendte anmeldelser og statistik. Ingen patient-id eller navn. Svar kun når det er godkendt.
export async function getPublicReviews(
  supabase: SupabaseClient,
  dentistId: string,
): Promise<{ stats: ReviewStats; reviews: PublicReviewDto[] }> {
  const rows = await listPublicReviews(supabase, dentistId);
  const stats = await getPublicReviewStats(supabase, dentistId);
  return {
    stats,
    reviews: rows.map((r) => ({
      id: r.reviewId,
      stars: r.stars,
      text: r.text,
      priceAccuracy: r.priceAccuracy,
      actualPrice: r.actualPrice,
      lackedTransparency: r.lackedTransparency,
      transparencyComment: r.transparencyComment,
      verifiedVisit: true,
      createdMonth: r.createdMonth,
      reply: r.replyText && r.replyCreatedAt ? { text: r.replyText, createdAt: r.replyCreatedAt } : null,
    })),
  };
}
