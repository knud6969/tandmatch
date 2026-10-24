import type { ClinicSort } from "@/lib/clinics/types/clinics";

// Den fælles del af patientens filtre i klinikoversigten (architecture 6.6, 10.7), som både weben og appen sender til
// GET /api/clinics. Hver klient har sine egne ekstra felter og sender kun dem, den bruger: felter, der udelades (undefined),
// kommer ikke med i forespørgslen.
export type ClinicQueryFilters = {
  serviceSlugs: readonly string[];
  postalCode: string; // tom eller fire cifre
  position: { lat: number; lng: number } | null;
  maxDistanceKm: number;
  emergency: boolean;
  sort: ClinicSort | null; // null = API'ets standard
  maxPrice?: number | null;
  minStars?: number | null;
  contactableOnly?: boolean;
  onlyOffering?: boolean;
};

export const hasClinicOrigin = (filters: Pick<ClinicQueryFilters, "position" | "postalCode">) =>
  filters.position !== null || filters.postalCode !== "";

// Afstand kræver et udgangspunkt, pris kræver valgte behandlinger; øvrige sorteringer kan altid bruges.
export function canSortClinicsBy(filters: Pick<ClinicQueryFilters, "position" | "postalCode" | "serviceSlugs">, sort: ClinicSort): boolean {
  if (sort === "distance") return hasClinicOrigin(filters);
  if (sort === "price") return filters.serviceSlugs.length > 0;
  return true;
}

// Bygger forespørgslens parametre (nøglerne i QUERY_KEYS i app/api/clinics/route.ts, værdierne efter clinicsQuerySchema).
// Afstand sendes kun med et udgangspunkt, og pris og onlyOffering kun med valgte behandlinger (API'et afviser dem ellers).
export function buildClinicQueryParams(filters: ClinicQueryFilters): URLSearchParams {
  const params = new URLSearchParams();
  const hasServices = filters.serviceSlugs.length > 0;
  if (hasServices) params.set("services", filters.serviceSlugs.join(","));
  if (filters.position) {
    params.set("lat", String(filters.position.lat));
    params.set("lng", String(filters.position.lng));
  } else if (filters.postalCode) {
    params.set("postalCode", filters.postalCode);
  }
  if (hasClinicOrigin(filters)) params.set("maxDistanceKm", String(filters.maxDistanceKm));
  if (filters.maxPrice != null && hasServices) params.set("maxPrice", String(filters.maxPrice));
  if (filters.minStars != null) params.set("minStars", String(filters.minStars));
  if (filters.emergency) params.set("emergency", "true");
  if (filters.contactableOnly) params.set("contactableOnly", "true");
  if (filters.onlyOffering && hasServices) params.set("onlyOffering", "true");
  if (filters.sort && canSortClinicsBy(filters, filters.sort)) params.set("sort", filters.sort);
  return params;
}

export const buildClinicQuery = (filters: ClinicQueryFilters): string => buildClinicQueryParams(filters).toString();
