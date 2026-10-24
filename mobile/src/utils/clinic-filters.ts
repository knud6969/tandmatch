import { DEFAULT_MAX_DISTANCE_KM, MAX_SELECTED_SERVICES } from "@/lib/clinics/constants/clinics";
import { buildClinicQuery, canSortClinicsBy, hasClinicOrigin } from "@/lib/clinics/domain/clinic-query";
import { postalCodeSchema } from "@/lib/clinics/schemas/clinics";
import type { ClinicSort } from "@/lib/clinics/types/clinics";

// Patientens filtre i klinikoversigten (architecture 6.6, 10.7). Positionen gemmes kun i skærmens tilstand.
export type DirectoryFilters = {
  serviceSlugs: string[];
  postalCode: string; // tom eller fire cifre
  position: { lat: number; lng: number } | null;
  maxDistanceKm: number;
  emergency: boolean;
  sort: ClinicSort | null; // null = API'ets standard
  // Kun klinikker med pris på alle valgte behandlinger (13.4a). Sendes kun, når der er valgt behandlinger.
  onlyOffering: boolean;
};

export const DEFAULT_FILTERS: DirectoryFilters = {
  serviceSlugs: [],
  postalCode: "",
  position: null,
  maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
  emergency: false,
  sort: null,
  onlyOffering: true,
};

// "Øg afstanden" i den tomme tilstand (13.4a).
export const WIDER_DISTANCE_KM = 100;

// Postnummeret valideres med samme skema som serveren.
export const isPostalCode = (value: string) => postalCodeSchema.safeParse(value).success;
export const hasOrigin = hasClinicOrigin;

// Forespørgslen til GET /api/clinics bygges af den fælles funktion i lib (samme som weben).
export const buildClinicsQuery = (filters: DirectoryFilters): string => buildClinicQuery(filters);

// Filteret på klinikker, der tilbyder behandlingerne, er kun i kraft med valgte behandlinger (uden dem giver serveren 400).
export const filtersOnOffering = (filters: DirectoryFilters) => filters.onlyOffering && filters.serviceSlugs.length > 0;

// "Vis også andre klinikker i området": samme filtre ellers.
export const showOtherClinics = (filters: DirectoryFilters): DirectoryFilters => ({ ...filters, onlyOffering: false });

// "Øg afstanden": 100 km fra postnummer eller position.
export const widenDistance = (filters: DirectoryFilters): DirectoryFilters => ({ ...filters, maxDistanceKm: WIDER_DISTANCE_KM });
export const canWidenDistance = (filters: DirectoryFilters) => hasOrigin(filters) && filters.maxDistanceKm < WIDER_DISTANCE_KM;

// Valgte behandlinger som visningsnavne ud fra kataloget (slug som reserve, hvis kataloget ikke er hentet).
export function serviceNames(slugs: string[], catalog: Map<string, string>): string[] {
  return slugs.map((slug) => catalog.get(slug) ?? slug);
}

// Sorteringer, der kræver noget andet (afstand kræver udgangspunkt, pris kræver en behandling), tilbydes ikke uden det.
export const canSortBy = (filters: DirectoryFilters, sort: ClinicSort): boolean => canSortClinicsBy(filters, sort);

// Slår en behandling til eller fra; højst MAX_SELECTED_SERVICES. Sorteringen på pris falder væk uden behandlinger.
export function toggleService(filters: DirectoryFilters, slug: string): DirectoryFilters {
  const selected = filters.serviceSlugs.includes(slug);
  if (!selected && filters.serviceSlugs.length >= MAX_SELECTED_SERVICES) return filters;
  const serviceSlugs = selected ? filters.serviceSlugs.filter((s) => s !== slug) : [...filters.serviceSlugs, slug];
  return { ...filters, serviceSlugs, sort: filters.sort === "price" && serviceSlugs.length === 0 ? null : filters.sort };
}

// Samme behandlinger i samme mængde, uanset rækkefølge.
export const sameServices = (a: string[], b: string[]) => a.length === b.length && a.every((slug) => b.includes(slug));

// Antal aktive filtre (til knappen "Filtre"). "Kun klinikker med pris" er slået til fra start, så det tæller, når det er slået fra.
export function activeFilterCount(filters: DirectoryFilters): number {
  return (
    (filters.serviceSlugs.length > 0 ? 1 : 0) + (hasOrigin(filters) ? 1 : 0) + (filters.emergency ? 1 : 0) + (filters.sort ? 1 : 0) +
    (!filters.onlyOffering ? 1 : 0)
  );
}
