import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { DEFAULT_MAX_DISTANCE_KM } from "@/lib/clinics/constants/clinics";
import type { availabilityQuerySchema, clinicProfileQuerySchema, clinicsQuerySchema } from "@/lib/clinics/schemas/clinics";
import type { ClinicListDto, ClinicProfileDto, SlotDto } from "@/lib/clinics/types/clinics";
import type { PublicReviewsDto } from "@/lib/booking/types/reviews";
import { ApiError, notFound } from "@/platform/middleware/http";
import type { Session } from "@/platform/middleware/session";
import { AvailabilityRepository } from "@/features/clinics/availabilityRepository";
import { ClinicDirectoryRepository, type PublicClinicRecord } from "@/features/clinics/clinicDirectoryRepository";
import { ClinicListingService, NO_REVIEWS } from "@/features/clinics/clinicListingService";
import { ReviewsRepository } from "@/features/booking";
import { ServicesRepository } from "@/features/clinics/servicesRepository";
import { ClinicSlotsService } from "@/features/clinics/clinicSlotsService";
import { AvailabilityService } from "@/features/clinics/availabilityService";
import { type LatLng, RankingService } from "@/features/clinics/rankingService";

type ClinicsQuery = z.infer<typeof clinicsQuerySchema>;
type ProfileQuery = z.infer<typeof clinicProfileQuerySchema>;
type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export type ClinicDirectoryDeps = {
  directory: ClinicDirectoryRepository;
  reviews: ReviewsRepository;
  availability: AvailabilityRepository;
  services: ServicesRepository;
  ranking: RankingService;
  slots: AvailabilityService;
  slotService: ClinicSlotsService;
  listing: ClinicListingService;
};

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

// Offentlig klinikoversigt, profil, ledige tider og anmeldelser (architecture 6.6, 6.7, 10.7). Åben for alle, også uden
// session; bruger kun brugerens klient (anon-nøglen uden session) og aldrig service role. Alt data kommer fra public_*-
// funktionerne, så `registered` og `removed` klinikker aldrig kan ses, og basisniveau (importerede klinikker) kun har
// grunddata og Trustpilot.
export class ClinicDirectoryController {
  private readonly directory: ClinicDirectoryRepository;
  private readonly reviewsRepo: ReviewsRepository;
  private readonly availability: AvailabilityRepository;
  private readonly services: ServicesRepository;
  private readonly ranking: RankingService;
  private readonly slotService: ClinicSlotsService;
  private readonly listing: ClinicListingService;

  constructor(
    supabase: SupabaseClient,
    // Sessionen bruges ikke (oversigten er den samme for alle), men gives for ens signatur (architecture 2.1.1).
    _session: Session | null,
    deps: Partial<ClinicDirectoryDeps> = {},
  ) {
    this.directory = deps.directory ?? new ClinicDirectoryRepository(supabase);
    this.reviewsRepo = deps.reviews ?? new ReviewsRepository(supabase);
    this.availability = deps.availability ?? new AvailabilityRepository(supabase);
    this.services = deps.services ?? new ServicesRepository(supabase);
    this.ranking = deps.ranking ?? new RankingService();
    const slots = deps.slots ?? new AvailabilityService();
    this.slotService =
      deps.slotService ??
      new ClinicSlotsService({ directory: this.directory, availability: this.availability, services: this.services, slots });
    this.listing =
      deps.listing ??
      new ClinicListingService({
        reviews: this.reviewsRepo,
        availability: this.availability,
        services: this.services,
        ranking: this.ranking,
        slots,
      });
  }

  // GET /api/clinics: alle synlige klinikker (eller kun dem i ?ids=), filtreret og sorteret af RankingService.
  async list(query: ClinicsQuery): Promise<ClinicListDto> {
    const plan = await this.listing.plan(query.services ?? []);
    const origin = await this.resolveOrigin(query);
    const records = await this.directory.listClinics(plan.priceServiceIds, query.ids ?? null);
    const context = await this.listing.contextFor(records);

    const items = records.map((record) => this.listing.toListItem(record, plan, context, origin));
    const filters = {
      maxDistanceKm: origin ? (query.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM) : undefined,
      maxPrice: query.maxPrice,
      minStars: query.minStars,
      emergency: query.emergency,
      contactableOnly: query.contactableOnly,
      onlyOffering: query.onlyOffering,
    };
    const sort = query.sort ?? this.ranking.defaultSort({ hasOrigin: origin !== null });
    return {
      clinics: this.ranking.rank(items, { sort, filters }),
      sort,
      criteria: this.ranking.criteria(sort, filters),
      origin: origin ? this.publicOrigin(origin, query) : null,
    };
  }

  // Udgangspunktet, appen får at vide: en given position afrundes (ca. 1 km); postnummerets punkt er offentlige data.
  private publicOrigin(origin: LatLng, query: ClinicsQuery): LatLng {
    if (query.lat === undefined) return origin;
    return { lat: roundCoordinate(origin.lat), lng: roundCoordinate(origin.lng) };
  }

  // GET /api/clinics/{id}: 404 for ukendte, `registered` og `removed` klinikker (de findes ikke i public_clinic_profile).
  async get(clinicId: string, query: ProfileQuery): Promise<ClinicProfileDto> {
    const plan = await this.listing.plan(query.services ?? []);
    const record = this.requireVisible(await this.directory.findProfile(clinicId, plan.priceServiceIds));
    const context = await this.listing.contextFor([record]);
    return {
      ...this.listing.toListItem(record, plan, context, null),
      description: record.description,
      email: record.email,
      allPrices: record.allPrices,
      dentists: record.dentists,
    };
  }

  // GET /api/clinics/{id}/availability: ledige tider for en behandling. Kun verificerede klinikker (404 ellers).
  async availabilityFor(clinicId: string, query: AvailabilityQuery): Promise<{ slots: SlotDto[] }> {
    return this.slotService.slotsFor(clinicId, query.serviceId, query, notFound);
  }

  // GET /api/clinics/{id}/reviews: godkendte anmeldelser og statistik. 404 for ikke-verificerede klinikker.
  async reviews(clinicId: string): Promise<PublicReviewsDto> {
    this.requireFull(await this.directory.findClinic(clinicId));
    const [stats, reviews] = await Promise.all([this.reviewsRepo.reviewStats([clinicId]), this.reviewsRepo.listPublic(clinicId)]);
    return { stats: stats.get(clinicId) ?? NO_REVIEWS, reviews };
  }

  private requireVisible<T extends PublicClinicRecord>(record: T | null): T {
    if (!record) throw notFound();
    return record;
  }

  private requireFull(record: PublicClinicRecord | null): PublicClinicRecord {
    const visible = this.requireVisible(record);
    if (visible.tier !== "full") throw notFound(); // importerede klinikker har hverken anmeldelser eller ledige tider
    return visible;
  }

  private async resolveOrigin(query: ClinicsQuery): Promise<LatLng | null> {
    if (query.lat !== undefined && query.lng !== undefined) return { lat: query.lat, lng: query.lng };
    if (query.postalCode === undefined) return null;
    const location = await this.directory.findPostalCodeLocation(query.postalCode);
    if (!location) throw new ApiError(400, "UNKNOWN_POSTAL_CODE", "Vi kender ikke postnummeret.");
    return location;
  }
}
