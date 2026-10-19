import { DEFAULT_MAX_DISTANCE_KM, MAX_SELECTED_SERVICES } from "@/lib/constants/clinics";
import { postalCodeSchema } from "@/lib/schemas/clinics";
import type { ClinicSort } from "@/lib/types/clinics";

// Patientens filtre i klinikoversigten (architecture 6.6, 10.7). Positionen gemmes kun i skærmens tilstand.
export type DirectoryFilters = {
  serviceSlugs: string[];
  postalCode: string; // tom eller fire cifre
  position: { lat: number; lng: number } | null;
  maxDistanceKm: number;
  emergency: boolean;
  sort: ClinicSort | null; // null = API'ets standard
};

export const DEFAULT_FILTERS: DirectoryFilters = {
  serviceSlugs: [],
  postalCode: "",
  position: null,
  maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
  emergency: false,
  sort: null,
};

export const isPostalCode = (value: string) => postalCodeSchema.safeParse(value).success;
export const hasOrigin = (filters: DirectoryFilters) => filters.position !== null || filters.postalCode !== "";

// Forespørgslen til GET /api/clinics: samme nøgler som weben (buildClinicsQuery i views/utils/clinic-query.ts).
// Afstand sendes kun med en position; sorteringen kun, når den giver mening (afstand kræver position, pris behandlinger).
export function buildClinicsQuery(filters: DirectoryFilters): string {
  const params = new URLSearchParams();
  if (filters.serviceSlugs.length > 0) params.set("services", filters.serviceSlugs.join(","));
  if (filters.position) {
    params.set("lat", String(filters.position.lat));
    params.set("lng", String(filters.position.lng));
  } else if (filters.postalCode) {
    params.set("postalCode", filters.postalCode);
  }
  if (hasOrigin(filters)) params.set("maxDistanceKm", String(filters.maxDistanceKm));
  if (filters.emergency) params.set("emergency", "true");
  if (filters.sort && canSortBy(filters, filters.sort)) params.set("sort", filters.sort);
  return params.toString();
}

export function canSortBy(filters: DirectoryFilters, sort: ClinicSort): boolean {
  if (sort === "distance") return hasOrigin(filters);
  if (sort === "price") return filters.serviceSlugs.length > 0;
  return true;
}

// Slår en behandling til eller fra; højst MAX_SELECTED_SERVICES. Sorteringen på pris falder væk uden behandlinger.
export function toggleService(filters: DirectoryFilters, slug: string): DirectoryFilters {
  const selected = filters.serviceSlugs.includes(slug);
  if (!selected && filters.serviceSlugs.length >= MAX_SELECTED_SERVICES) return filters;
  const serviceSlugs = selected ? filters.serviceSlugs.filter((s) => s !== slug) : [...filters.serviceSlugs, slug];
  return { ...filters, serviceSlugs, sort: filters.sort === "price" && serviceSlugs.length === 0 ? null : filters.sort };
}

// Antal aktive filtre (til knappen "Filtre").
export function activeFilterCount(filters: DirectoryFilters): number {
  return (
    (filters.serviceSlugs.length > 0 ? 1 : 0) + (hasOrigin(filters) ? 1 : 0) + (filters.emergency ? 1 : 0) + (filters.sort ? 1 : 0)
  );
}
