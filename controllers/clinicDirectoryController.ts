import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { DEFAULT_MAX_DISTANCE_KM } from "@/lib/constants/clinics";
import { FIRST_AVAILABLE_SEARCH_DAYS } from "@/lib/constants/bookings";
import { EXAMINATION_SERVICE_SLUG } from "@/lib/constants/services";
import type { availabilityQuerySchema, clinicProfileQuerySchema, clinicsQuerySchema } from "@/lib/schemas/clinics";
import type {
  ClinicListDto,
  ClinicListItemDto,
  ClinicProfileDto,
  SlotDto,
} from "@/lib/types/clinics";
import type { PublicReviewsDto, ReviewStats } from "@/lib/types/reviews";
import type { ServiceDto } from "@/lib/types/services";
import type { BusyInterval } from "@/lib/types/clinics";
import { ApiError, notFound } from "@/middleware/http";
import type { Session } from "@/middleware/session";
import { AvailabilityRepository } from "@/models/availabilityRepository";
import {
  ClinicDirectoryRepository,
  type PublicClinicProfileRecord,
  type PublicClinicRecord,
} from "@/models/clinicDirectoryRepository";
import { ServicesRepository } from "@/models/servicesRepository";
import { AvailabilityService } from "@/services/availabilityService";
import { type LatLng, RankingService } from "@/services/rankingService";

type ClinicsQuery = z.infer<typeof clinicsQuerySchema>;
type ProfileQuery = z.infer<typeof clinicProfileQuerySchema>;
type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export type ClinicDirectoryDeps = {
  directory: ClinicDirectoryRepository;
  availability: AvailabilityRepository;
  services: ServicesRepository;
  ranking: RankingService;
  slots: AvailabilityService;
};

const NO_REVIEWS: ReviewStats = { reviewCount: 0, avgStars: null, priceAccuracyPct: null, distribution: null };

// De behandlinger en forespørgsel handler om: de valgte (priser og sum), dem første ledige tid måles for, og akutbehandlingen
// til første akuttid.
type Plan = {
  selected: ServiceDto[];
  appointment: ServiceDto[];
  appointmentIsEmergency: boolean;
  emergency: ServiceDto | null;
  priceServiceIds: string[];
};

// Offentlig klinikoversigt, profil, ledige tider og anmeldelser (architecture 6.6, 6.7, 10.7). Åben for alle, også uden
// session; bruger kun brugerens klient (anon-nøglen uden session) og aldrig service role. Alt data kommer fra public_*-
// funktionerne, så `registered` og `removed` klinikker aldrig kan ses, og basisniveau (importerede klinikker) kun har
// grunddata og Trustpilot.
export class ClinicDirectoryController {
  private readonly directory: ClinicDirectoryRepository;
  private readonly availability: AvailabilityRepository;
  private readonly services: ServicesRepository;
  private readonly ranking: RankingService;
  private readonly slots: AvailabilityService;

  constructor(
    supabase: SupabaseClient,
    // Sessionen bruges ikke (oversigten er den samme for alle), men gives for ens signatur (architecture 2.1.1).
    _session: Session | null,
    deps: Partial<ClinicDirectoryDeps> = {},
  ) {
    this.directory = deps.directory ?? new ClinicDirectoryRepository(supabase);
    this.availability = deps.availability ?? new AvailabilityRepository(supabase);
    this.services = deps.services ?? new ServicesRepository(supabase);
    this.ranking = deps.ranking ?? new RankingService();
    this.slots = deps.slots ?? new AvailabilityService();
  }

  // GET /api/clinics: alle synlige klinikker (eller kun dem i ?ids=), filtreret og sorteret af RankingService.
  async list(query: ClinicsQuery): Promise<ClinicListDto> {
    const plan = await this.plan(query.services ?? []);
    const origin = await this.resolveOrigin(query);
    const records = await this.directory.listClinics(plan.priceServiceIds, query.ids ?? null);
    const context = await this.contextFor(records);

    const items = records.map((record) => this.toListItem(record, plan, context, origin));
    const filters = {
      maxDistanceKm: origin ? (query.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM) : undefined,
      maxPrice: query.maxPrice,
      minStars: query.minStars,
      emergency: query.emergency,
      contactableOnly: query.contactableOnly,
    };
    const sort = query.sort ?? this.ranking.defaultSort({ hasOrigin: origin !== null, emergency: query.emergency === true });
    return {
      clinics: this.ranking.rank(items, { sort, filters }),
      sort,
      criteria: this.ranking.criteria(sort, filters),
    };
  }

  // GET /api/clinics/{id}: 404 for ukendte, `registered` og `removed` klinikker (de findes ikke i public_clinic_profile).
  async get(clinicId: string, query: ProfileQuery): Promise<ClinicProfileDto> {
    const plan = await this.plan(query.services ?? []);
    const record = this.requireVisible(await this.directory.findProfile(clinicId, plan.priceServiceIds));
    const context = await this.contextFor([record]);
    return {
      ...this.toListItem(record, plan, context, null),
      description: record.description,
      email: record.email,
      allPrices: record.allPrices,
      dentists: record.dentists,
    };
  }

  // GET /api/clinics/{id}/availability: ledige tider for en behandling. Kun verificerede klinikker (404 ellers).
  async availabilityFor(clinicId: string, query: AvailabilityQuery): Promise<{ slots: SlotDto[] }> {
    const [service] = await this.services.requireActive([query.serviceId]);
    const record = this.requireFull(await this.directory.findClinic(clinicId, [service.id]));

    const range = this.slots.resolveRange(query.from, query.to);
    if (!range.ok) throw new ApiError(400, "VALIDATION_ERROR", range.message);
    const { from, to } = range;

    const busy = (await this.availability.listBusyIntervals([clinicId], from, to)).get(clinicId) ?? [];
    return {
      slots: this.slots.slots({
        openingHours: record.openingHours,
        busy,
        durationMin: this.slots.durationFor(record.prices, [service]),
        isEmergency: service.category === "emergency",
        from,
        to,
      }),
    };
  }

  // GET /api/clinics/{id}/reviews: godkendte anmeldelser og statistik. 404 for ikke-verificerede klinikker.
  async reviews(clinicId: string): Promise<PublicReviewsDto> {
    this.requireFull(await this.directory.findClinic(clinicId));
    const [stats, reviews] = await Promise.all([this.directory.reviewStats([clinicId]), this.directory.listReviews(clinicId)]);
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

  // Slår de valgte behandlinger op i kataloget og vælger, hvad første ledige tid og første akuttid måles for.
  private async plan(slugs: readonly string[]): Promise<Plan> {
    const catalog = (await this.services.listGroups()).flatMap((group) => group.services);
    const selected = slugs.map((slug) => {
      const service = catalog.find((candidate) => candidate.slug === slug);
      if (!service) throw new ApiError(400, "UNKNOWN_SERVICE", "En af behandlingerne findes ikke i kataloget.");
      return service;
    });
    // Uden valg måles første ledige tid for en undersøgelse (architecture 6.6).
    const examination = catalog.find((service) => service.slug === EXAMINATION_SERVICE_SLUG);
    const appointment = selected.length > 0 ? selected : examination ? [examination] : [];
    // Akuttid: en valgt akutbehandling, ellers den korteste akutbehandling i kataloget.
    const emergency =
      selected.find((service) => service.category === "emergency") ??
      catalog
        .filter((service) => service.category === "emergency")
        .sort((a, b) => a.defaultDurationMin - b.defaultDurationMin)[0] ??
      null;
    const priceServiceIds = [...new Set([...selected, ...appointment, ...(emergency ? [emergency] : [])].map((s) => s.id))];
    return {
      selected,
      appointment,
      appointmentIsEmergency: appointment.some((service) => service.category === "emergency"),
      emergency,
      priceServiceIds,
    };
  }

  private async resolveOrigin(query: ClinicsQuery): Promise<LatLng | null> {
    if (query.lat !== undefined && query.lng !== undefined) return { lat: query.lat, lng: query.lng };
    if (query.postalCode === undefined) return null;
    const location = await this.directory.findPostalCodeLocation(query.postalCode);
    if (!location) throw new ApiError(400, "UNKNOWN_POSTAL_CODE", "Vi kender ikke postnummeret.");
    return location;
  }

  // Anmeldelsesstatistik og optaget tid for de verificerede klinikker, hentet samlet (to kald uanset antal klinikker).
  private async contextFor(records: readonly PublicClinicRecord[]) {
    const fullIds = records.filter((record) => record.tier === "full").map((record) => record.id);
    const range = this.slots.searchRange(FIRST_AVAILABLE_SEARCH_DAYS);
    const [stats, busy] = await Promise.all([
      this.directory.reviewStats(fullIds),
      this.availability.listBusyIntervals(fullIds, range.from, range.to),
    ]);
    return { stats, busy, range };
  }

  private toListItem(
    record: PublicClinicRecord | PublicClinicProfileRecord,
    plan: Plan,
    context: Awaited<ReturnType<ClinicDirectoryController["contextFor"]>>,
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
      distanceKm: origin && record.location ? this.ranking.distanceKm(origin, record.location) : null,
      trustpilot: record.trustpilot,
      reviewStats: null,
      logoUrl: null,
      prices: [],
      priceForSelection: null,
      firstAvailableAt: null,
      firstEmergencyAt: null,
    };
    // Basisniveau: grunddata og Trustpilot, ingen priser, anmeldelser eller statistik (architecture 6.6).
    if (record.tier !== "full") return base;

    const selectedIds = plan.selected.map((service) => service.id);
    const busy: BusyInterval[] = context.busy.get(record.id) ?? [];
    const search = { openingHours: record.openingHours, busy, from: context.range.from, to: context.range.to };
    const hasEmergencyHours = record.openingHours.some((window) => window.isEmergency);
    return {
      ...base,
      reviewStats: context.stats.get(record.id) ?? NO_REVIEWS,
      logoUrl: record.logoUrl,
      prices: record.prices.filter((price) => selectedIds.includes(price.serviceId)),
      priceForSelection: this.ranking.priceForSelection(record, record.prices, selectedIds),
      firstAvailableAt:
        this.slots.firstSlot({
          ...search,
          durationMin: this.slots.durationFor(record.prices, plan.appointment),
          isEmergency: plan.appointmentIsEmergency,
        })?.startsAt ?? null,
      firstEmergencyAt:
        plan.emergency && hasEmergencyHours
          ? (this.slots.firstSlot({ ...search, durationMin: this.slots.durationFor(record.prices, [plan.emergency]), isEmergency: true })?.startsAt ?? null)
          : null,
    };
  }
}
