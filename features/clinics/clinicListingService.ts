import "server-only";
import { FIRST_AVAILABLE_SEARCH_DAYS } from "@/lib/booking/constants/bookings";
import { EXAMINATION_SERVICE_SLUG } from "@/lib/clinics/constants/services";
import type { BusyInterval, ClinicListItemDto } from "@/lib/clinics/types/clinics";
import type { ReviewStats } from "@/lib/booking/types/reviews";
import type { ServiceDto } from "@/lib/clinics/types/services";
import { ApiError } from "@/platform/middleware/http";
import { ReviewsRepository } from "@/features/booking";
import type { AvailabilityRepository } from "@/features/clinics/availabilityRepository";
import type { AvailabilityService } from "@/features/clinics/availabilityService";
import type { PublicClinicProfileRecord, PublicClinicRecord } from "@/features/clinics/clinicDirectoryRepository";
import { type LatLng, RankingService } from "@/features/clinics/rankingService";
import type { ServicesRepository } from "@/features/clinics/servicesRepository";
import { UNKNOWN_SERVICE_TEXT } from "@/lib/common/constants/error-texts";

export const NO_REVIEWS: ReviewStats = { reviewCount: 0, avgStars: null, priceAccuracyPct: null, distribution: null };

// De behandlinger en forespørgsel handler om: de valgte (priser og sum), dem første ledige tid måles for, og katalogets
// akutbehandlinger (en klinik tager imod akutte patienter, når den har en pris på mindst én af dem).
export type ListingPlan = {
  selected: ServiceDto[];
  appointment: ServiceDto[];
  appointmentIsEmergency: boolean;
  emergencyIds: string[];
  priceServiceIds: string[];
};

export type ListingContext = Awaited<ReturnType<ClinicListingService["contextFor"]>>;

export type ClinicListingDeps = {
  reviews: ReviewsRepository;
  availability: AvailabilityRepository;
  services: ServicesRepository;
  ranking: RankingService;
  slots: AvailabilityService;
};

// Omdanner offentlige klinikrækker til `ClinicListItemDto` (architecture 6.6, 10.7): anmeldelsesstatistik, pris for valget og
// første ledige tid. Bruges af klinikoversigten og favoritlisten, så mappingen findes ét sted (clinics 10.17). Ingen tilstand
// ud over de repositories, der gives i constructoren.
export class ClinicListingService {
  constructor(private readonly deps: ClinicListingDeps) {}

  // Slår de valgte behandlinger op i kataloget og vælger, hvad første ledige tid måles for.
  async plan(slugs: readonly string[]): Promise<ListingPlan> {
    const catalog = (await this.deps.services.listGroups()).flatMap((group) => group.services);
    const selected = slugs.map((slug) => {
      const service = catalog.find((candidate) => candidate.slug === slug);
      if (!service) throw new ApiError(400, "UNKNOWN_SERVICE", UNKNOWN_SERVICE_TEXT);
      return service;
    });
    // Uden valg måles første ledige tid for en undersøgelse (architecture 6.6).
    const examination = catalog.find((service) => service.slug === EXAMINATION_SERVICE_SLUG);
    const appointment = selected.length > 0 ? selected : examination ? [examination] : [];
    const emergencyIds = catalog.filter((service) => service.category === "emergency").map((service) => service.id);
    const priceServiceIds = [...new Set([...selected, ...appointment].map((s) => s.id).concat(emergencyIds))];
    return {
      selected,
      appointment,
      appointmentIsEmergency: appointment.some((service) => service.category === "emergency"),
      emergencyIds,
      priceServiceIds,
    };
  }

  // Anmeldelsesstatistik og optaget tid for de verificerede klinikker, hentet samlet (to kald uanset antal klinikker).
  async contextFor(records: readonly PublicClinicRecord[]) {
    const fullIds = records.filter((record) => record.tier === "full").map((record) => record.id);
    const range = this.deps.slots.searchRange(FIRST_AVAILABLE_SEARCH_DAYS);
    const [stats, busy] = await Promise.all([
      this.deps.reviews.reviewStats(fullIds),
      this.deps.availability.listBusyIntervals(fullIds, range.from, range.to),
    ]);
    return { stats, busy, range };
  }

  toListItem(
    record: PublicClinicRecord | PublicClinicProfileRecord,
    plan: ListingPlan,
    context: ListingContext,
    origin: LatLng | null,
  ): ClinicListItemDto {
    const base: ClinicListItemDto = {
      id: record.id,
      name: record.name,
      tier: record.tier,
      canReceiveLeads: record.canReceiveLeads,
      address: record.address,
      postalCode: record.postalCode,
      city: record.city,
      location: record.location,
      phone: record.phone,
      website: record.website,
      openingHours: record.openingHours,
      distanceKm: origin && record.location ? this.deps.ranking.distanceKm(origin, record.location) : null,
      trustpilot: record.trustpilot,
      reviewStats: null,
      logoUrl: null,
      prices: [],
      priceForSelection: null,
      firstAvailableAt: null,
      takesEmergency: false,
    };
    // Basisniveau: grunddata og Trustpilot, ingen priser, anmeldelser eller statistik (architecture 6.6).
    if (record.tier !== "full") return base;

    const selectedIds = plan.selected.map((service) => service.id);
    const busy: BusyInterval[] = context.busy.get(record.id) ?? [];
    const search = { openingHours: record.openingHours, busy, from: context.range.from, to: context.range.to };
    return {
      ...base,
      reviewStats: context.stats.get(record.id) ?? NO_REVIEWS,
      logoUrl: record.logoUrl,
      prices: record.prices.filter((price) => selectedIds.includes(price.serviceId)),
      priceForSelection: this.deps.ranking.priceForSelection(record, record.prices, selectedIds),
      firstAvailableAt:
        this.deps.slots.firstSlot({
          ...search,
          durationMin: this.deps.slots.durationFor(record.prices, plan.appointment),
          isEmergency: plan.appointmentIsEmergency,
        })?.startsAt ?? null,
      takesEmergency: record.prices.some((price) => plan.emergencyIds.includes(price.serviceId)),
    };
  }
}
