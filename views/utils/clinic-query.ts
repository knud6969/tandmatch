import { DEFAULT_MAX_DISTANCE_KM } from "@/lib/constants/clinics";
import type { ClinicSort } from "@/lib/types/clinics";

// Patientens filtre i klinikoversigten (architecture 6.6, 10.7). Står i URL'en kun for det, der kommer udefra
// (?akut=1, ?sag=), og ellers i komponentens tilstand.
export type DirectoryFilters = {
  serviceSlugs: string[];
  postalCode: string; // tom eller fire cifre
  position: { lat: number; lng: number } | null;
  maxDistanceKm: number;
  maxPrice: number | null;
  minStars: number | null;
  emergency: boolean;
  contactableOnly: boolean;
  sort: ClinicSort | null; // null = API'ets standard
};

export const DEFAULT_FILTERS: DirectoryFilters = {
  serviceSlugs: [],
  postalCode: "",
  position: null,
  maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
  maxPrice: null,
  minStars: null,
  emergency: false,
  contactableOnly: false,
  sort: null,
};

export const hasOrigin = (filters: DirectoryFilters) => filters.position !== null || filters.postalCode !== "";

// Bygger forespørgslen til GET /api/clinics. Afstand og pris sendes kun, når de giver mening (API'et afviser maxPrice
// uden behandlinger).
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
  if (filters.maxPrice !== null && filters.serviceSlugs.length > 0) params.set("maxPrice", String(filters.maxPrice));
  if (filters.minStars !== null) params.set("minStars", String(filters.minStars));
  if (filters.emergency) params.set("emergency", "true");
  if (filters.contactableOnly) params.set("contactableOnly", "true");
  // Afstand og pris kan kun sorteres efter, når der er en position eller valgte behandlinger.
  const sortable = filters.sort !== "distance" || hasOrigin(filters);
  const priceSortable = filters.sort !== "price" || filters.serviceSlugs.length > 0;
  if (filters.sort && sortable && priceSortable) params.set("sort", filters.sort);
  return params.toString();
}

const POSTAL_CODE = /^\d{4}$/;
export const isPostalCode = (value: string) => POSTAL_CODE.test(value);
