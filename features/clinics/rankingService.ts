import { CLINIC_SORT_LABEL, EMERGENCY_FILTER_HOURS } from "@/lib/clinics/constants/clinics";
import type { ClinicListItemDto, ClinicPriceDto, ClinicSort } from "@/lib/clinics/types/clinics";
import type { PriceRange } from "@/lib/common/types/common";

// Rangering og filtrering af klinikker efter faste, synlige kriterier (architecture 6.6). Ren kode uden I/O: ingen
// models, ingen Supabase, ingen AI. Klinikkerne er allerede bygget som ClinicListItemDto (afstand, pris for valget og
// første ledige tid er sat af controlleren), så servicen kun sorterer og filtrerer. Alle værdier uden for kriteriet
// ("null") sorteres sidst, og ved lighed afgør navnet.

export type LatLng = { lat: number; lng: number };

export type RankingFilters = {
  maxDistanceKm?: number; // sættes kun, når patienten har en position; klinikker uden afstand falder så fra
  maxPrice?: number; // hele kroner, mod laveste pris for valget (sum af price_min)
  minStars?: number;
  emergency?: boolean; // kun klinikker med akuttid inden for EMERGENCY_FILTER_HOURS
  contactableOnly?: boolean; // kun verificerede klinikker
};

export type RankingOptions = { sort: ClinicSort; filters?: RankingFilters };

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

type Direction = "asc" | "desc";
type SortKey = { value: (clinic: ClinicListItemDto) => number | null; direction: Direction };

const byName = (a: ClinicListItemDto, b: ClinicListItemDto) => a.name.localeCompare(b.name, "da");

export class RankingService {
  // `clock` gives i constructoren, så "akuttid inden for 48 timer" kan testes.
  constructor(private readonly clock: () => Date = () => new Date()) {}

  // Afstand i km (Haversine), afrundet til én decimal.
  distanceKm(from: LatLng, to: LatLng): number {
    const dLat = toRadians(to.lat - from.lat);
    const dLng = toRadians(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
    return Math.round(km * 10) / 10;
  }

  // Summen af priserne for de valgte ydelser. Kun verificerede klinikker (niveau "fuld") med pris for ALLE valgte
  // ydelser får en pris; ellers null (6.6). Uden valgte ydelser er der ingen pris at sammenligne.
  priceForSelection(clinic: Pick<ClinicListItemDto, "tier">, prices: readonly ClinicPriceDto[], selectedServiceIds: readonly string[]): PriceRange | null {
    const wanted = [...new Set(selectedServiceIds)];
    if (clinic.tier !== "full" || wanted.length === 0) return null;
    let min = 0;
    let max = 0;
    for (const serviceId of wanted) {
      const price = prices.find((p) => p.serviceId === serviceId);
      if (!price) return null;
      min += price.price.min;
      max += price.price.max;
    }
    return { min, max };
  }

  // Standardsortering (6.6): på akutvejen første ledige tid; ellers afstand, hvis patienten har en position; ellers
  // første ledige tid.
  defaultSort(options: { hasOrigin: boolean; emergency: boolean }): ClinicSort {
    if (options.emergency) return "first_available";
    return options.hasOrigin ? "distance" : "first_available";
  }

  // Filtrerer og sorterer. Ændrer ikke indgangslisten.
  rank(clinics: readonly ClinicListItemDto[], options: RankingOptions): ClinicListItemDto[] {
    const filters = options.filters ?? {};
    return this.sort(this.filter(clinics, filters), options.sort, filters.emergency === true);
  }

  filter(clinics: readonly ClinicListItemDto[], filters: RankingFilters): ClinicListItemDto[] {
    const now = this.clock().getTime();
    const emergencyUntil = now + EMERGENCY_FILTER_HOURS * 60 * 60 * 1000;
    return clinics.filter((clinic) => {
      if (filters.contactableOnly && !clinic.canReceiveLeads) return false;
      if (filters.maxDistanceKm !== undefined && (clinic.distanceKm === null || clinic.distanceKm > filters.maxDistanceKm)) {
        return false;
      }
      // Uden pris for alle valgte ydelser kan klinikken ikke leve op til et prisloft.
      if (filters.maxPrice !== undefined && (clinic.priceForSelection === null || clinic.priceForSelection.min > filters.maxPrice)) {
        return false;
      }
      if (filters.minStars !== undefined) {
        const stars = clinic.reviewStats?.avgStars ?? null;
        if (stars === null || stars < filters.minStars) return false;
      }
      if (filters.emergency) {
        const at = clinic.firstEmergencyAt === null ? null : Date.parse(clinic.firstEmergencyAt);
        if (at === null || Number.isNaN(at) || at > emergencyUntil) return false;
      }
      return true;
    });
  }

  // Sorterer efter ét kriterium (6.6). `emergency` bytter "første ledige tid" ud med første akuttid.
  sort(clinics: readonly ClinicListItemDto[], sort: ClinicSort, emergency = false): ClinicListItemDto[] {
    const keys = this.keysFor(sort, emergency);
    return [...clinics].sort((a, b) => {
      for (const key of keys) {
        const x = key.value(a);
        const y = key.value(b);
        if (x === y) continue;
        if (x === null) return 1; // uden værdi sidst, uanset retning
        if (y === null) return -1;
        return key.direction === "asc" ? x - y : y - x;
      }
      return byName(a, b);
    });
  }

  private keysFor(sort: ClinicSort, emergency: boolean): SortKey[] {
    const time = (value: string | null) => {
      if (value === null) return null;
      const ms = Date.parse(value);
      return Number.isNaN(ms) ? null : ms;
    };
    switch (sort) {
      case "price":
        return [{ value: (c) => c.priceForSelection?.min ?? null, direction: "asc" }];
      case "rating":
        return [
          { value: (c) => (c.reviewStats && c.reviewStats.reviewCount > 0 ? c.reviewStats.avgStars : null), direction: "desc" },
          { value: (c) => (c.reviewStats && c.reviewStats.reviewCount > 0 ? c.reviewStats.reviewCount : null), direction: "desc" },
        ];
      case "price_accuracy":
        return [{ value: (c) => c.reviewStats?.priceAccuracyPct ?? null, direction: "desc" }];
      case "distance":
        return [{ value: (c) => c.distanceKm, direction: "asc" }];
      case "first_available":
        return [{ value: (c) => time(emergency ? c.firstEmergencyAt : c.firstAvailableAt), direction: "asc" }];
    }
  }

  // Kriterierne i klartekst, som de vises ved listen (6.6).
  criteria(sort: ClinicSort, filters: RankingFilters = {}): string[] {
    const lines = [`Sortering: ${CLINIC_SORT_LABEL[sort]}`];
    if (filters.maxDistanceKm !== undefined) lines.push(`Højst ${filters.maxDistanceKm} km væk`);
    if (filters.maxPrice !== undefined) lines.push(`Pris fra højst ${filters.maxPrice.toLocaleString("da-DK")} kr.`);
    if (filters.minStars !== undefined) lines.push(`Mindst ${filters.minStars.toLocaleString("da-DK")} stjerner`);
    if (filters.emergency) lines.push(`Akuttid inden for ${EMERGENCY_FILTER_HOURS} timer`);
    if (filters.contactableOnly) lines.push("Kun klinikker, der kan kontaktes");
    lines.push("Klinikker uden værdi for kriteriet står nederst");
    return lines;
  }
}
