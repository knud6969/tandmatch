import { CLINIC_SORTS, DEFAULT_MAX_DISTANCE_KM } from "@/lib/constants/clinics";
import { postalCodeSchema, servicesParamSchema } from "@/lib/schemas/clinics";
import type { ClinicSort } from "@/lib/types/clinics";
import { isUuid } from "@/platform/ui-utils/ids";

// Patientens filtre i klinikoversigten (architecture 6.6, 10.7). De spejles i URL'en (2.8, B16), så genindlæsning, profil
// og tilbage samt deling bevarer dem.
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
  return buildParams(filters).toString();
}

function buildParams(filters: DirectoryFilters): URLSearchParams {
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
  return params;
}

export const isPostalCode = (value: string) => postalCodeSchema.safeParse(value).success;

// Filtrene som adresselinje til siden selv: samme nøgler som API'et, men akut er `?akut=1`. `?sag=` bevares.
// Positionen ("Brug min position") kommer aldrig i adressen, kun i komponentens tilstand (besluttet, architecture 6.1).
export function filtersToSearch(filters: DirectoryFilters, caseId: string | null): string {
  const params = buildParams({ ...filters, position: null });
  params.delete("emergency");
  if (filters.emergency) params.set("akut", "1");
  if (caseId) {
    params.set("sag", caseId);
    // Med en sag er "kun klinikker, der kan kontaktes" slået til som standard, så fravalget skal stå i adressen.
    if (!filters.contactableOnly) params.set("contactableOnly", "false");
  }
  return params.toString();
}

// Standardfiltrene: med en sag (?sag=) er "kun klinikker, der kan kontaktes" slået til.
export const defaultFilters = (caseId: string | null): DirectoryFilters => ({ ...DEFAULT_FILTERS, contactableOnly: caseId !== null });

// Links mellem oversigten og profilen. Profilen får oversigtens filtre med, så "Alle klinikker" fører tilbage til dem.
export const clinicProfileHref = (clinicId: string, search: string) => `/klinikker/${clinicId}${search ? `?${search}` : ""}`;
export const directoryHref = (search: string) => `/klinikker${search ? `?${search}` : ""}`;

const numberParam = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Omvendt: læser filtrene fra adressen. Ugyldige værdier ignoreres (adressen kan være redigeret eller delt).
export function filtersFromSearch(params: URLSearchParams): DirectoryFilters {
  const emergency = params.get("akut") === "1" || params.get("emergency") === "true";
  const services = servicesParamSchema.safeParse(params.get("services") ?? "");
  const postalCode = params.get("postalCode") ?? "";
  const distance = numberParam(params.get("maxDistanceKm"));
  const price = numberParam(params.get("maxPrice"));
  const stars = numberParam(params.get("minStars"));
  const sortParam = params.get("sort");
  const sort = CLINIC_SORTS.find((candidate) => candidate === sortParam) ?? (emergency ? "first_available" : null);
  const serviceSlugs = services.success ? services.data : [];
  return {
    ...DEFAULT_FILTERS,
    serviceSlugs,
    postalCode: isPostalCode(postalCode) ? postalCode : "",
    position: null, // lat/lng i adressen ignoreres bevidst
    maxDistanceKm: distance !== null && distance > 0 ? distance : DEFAULT_MAX_DISTANCE_KM,
    maxPrice: price !== null && price >= 0 && serviceSlugs.length > 0 ? price : null,
    minStars: stars !== null && stars >= 1 && stars <= 5 ? stars : null,
    emergency,
    // Med en sag er "kun klinikker, der kan kontaktes" slået til, medmindre adressen siger andet.
    contactableOnly: params.has("contactableOnly") ? params.get("contactableOnly") === "true" : isUuid(params.get("sag")),
    sort,
  };
}
