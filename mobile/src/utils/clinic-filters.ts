import { DEFAULT_MAX_DISTANCE_KM, MAX_SELECTED_SERVICES } from "@/lib/clinics/constants/clinics";
import { buildClinicQuery, canSortClinicsBy, hasClinicOrigin } from "@/lib/clinics/domain/clinic-query";
import { postalCodeSchema } from "@/lib/clinics/schemas/clinics";
import type { ClinicSort } from "@/lib/clinics/types/clinics";
import { MAX_RADIUS_KM } from "./map-region";

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


// Postnummeret valideres med samme skema som serveren.
export const isPostalCode = (value: string) => postalCodeSchema.safeParse(value).success;
export const hasOrigin = hasClinicOrigin;

// Forespørgslen til GET /api/clinics bygges af den fælles funktion i lib (samme som weben).
export const buildClinicsQuery = (filters: DirectoryFilters): string => buildClinicQuery(filters);

// Filteret på klinikker, der tilbyder behandlingerne, er kun i kraft med valgte behandlinger (uden dem giver serveren 400).
export const filtersOnOffering = (filters: DirectoryFilters) => filters.onlyOffering && filters.serviceSlugs.length > 0;

// "Vis også andre klinikker i området": samme filtre ellers.
export const showOtherClinics = (filters: DirectoryFilters): DirectoryFilters => ({ ...filters, onlyOffering: false });

// "Øg afstanden" (13.4a): fordobler radius fra postnummer eller position, aldrig over kortets maks (samme grænse som skyderen).
export const widenDistance = (filters: DirectoryFilters): DirectoryFilters => ({
  ...filters,
  maxDistanceKm: Math.min(MAX_RADIUS_KM, Math.max(filters.maxDistanceKm + 1, filters.maxDistanceKm * 2)),
});
export const canWidenDistance = (filters: DirectoryFilters) => hasOrigin(filters) && filters.maxDistanceKm < MAX_RADIUS_KM;

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

// Hvad der blev søgt på, som label/værdi-linjer til den tomme liste, så patienten (og fejlsøgning) kan se det.
export type SearchSummaryLine = { label: string; value: string };

export function searchSummary(filters: DirectoryFilters, names: Map<string, string>): SearchSummaryLine[] {
  const lines: SearchSummaryLine[] = [];
  if (filters.serviceSlugs.length > 0) {
    lines.push({ label: "Behandlinger", value: serviceNames(filters.serviceSlugs, names).join(", ") });
  }
  // Positionen går forud for postnummeret, som i forespørgslen.
  if (filters.position) {
    lines.push({ label: "Udgangspunkt", value: "din position" }, { label: "Afstand", value: `op til ${filters.maxDistanceKm} km` });
  } else if (isPostalCode(filters.postalCode)) {
    lines.push({ label: "Udgangspunkt", value: `postnummer ${filters.postalCode}` }, { label: "Afstand", value: `op til ${filters.maxDistanceKm} km` });
  } else {
    lines.push({ label: "Udgangspunkt", value: "intet postnummer eller position valgt, så afstand indgår ikke" });
  }
  lines.push({ label: "Akut", value: filters.emergency ? "slået til" : "slået fra" });
  return lines;
}

// Det af sagen, der styrer filtrene: behandlinger (uafhængigt af rækkefølge) og postnummer.
type CaseFilterSource = { postalCode: string | null; services: { slug: string }[] };

// Sags-tilstand starter altid fra standardfiltrene, så gamle filtre (akut, sortering, afstand, position) ikke følger med fra en tidligere
// brug af fanen. Kun sagens behandlinger og postnummer sættes, og "kun klinikker med pris" er slået til.
export function filtersForCase(dto: CaseFilterSource): DirectoryFilters {
  return {
    ...DEFAULT_FILTERS,
    serviceSlugs: dto.services.map((service) => service.slug),
    postalCode: dto.postalCode ?? "",
    position: null,
    onlyOffering: true,
  };
}

// Nøgle for sagens behandlinger og postnummer. Ændres den, er sagen ændret, og filtrene skal tages fra sagen igen.
export const caseFilterKey = (caseId: string, dto: CaseFilterSource): string =>
  `${caseId}|${dto.postalCode ?? ""}|${[...dto.services.map((service) => service.slug)].sort().join(",")}`;

// Skal filtrene sættes fra sagen? Ja første gang og når sagen er ændret; ellers bevares patientens egne ændringer, mens hun er på skærmen.
export const shouldApplyCase = (appliedKey: string | null, nextKey: string): boolean => appliedKey !== nextKey;
