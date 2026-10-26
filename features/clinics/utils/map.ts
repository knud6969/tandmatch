import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";

// Kortindstillinger (Leaflet, clinics 6.6). Ingen API-nøgle. Fliserne hentes direkte af browseren fra OpenStreetMaps
// offentlige fliseserver (kræver `img-src https://tile.openstreetmap.org` i CSP, next.config.ts). De dæmpes med et
// CSS-filter (`.leaflet-tile-pane` i app/globals.css), så kortet ligner appens Apple Maps mere, og markørerne står tydeligt.
// CARTOs gratis basiskort kræver nu en API-nøgle (2026-10-26) og bruges derfor ikke.
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_MAX_ZOOM = 19;

// Kreditering, der altid skal være synlig (OSM's licens).
export const MAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap-bidragydere</a>';

// Danmark som udgangsvisning, når der ingen markører er (appens DENMARK_REGION).
export const DENMARK_CENTER: [number, number] = [56.0, 10.5];
export const DENMARK_ZOOM = 7;

// Udsnit som i appen (mobile/src/utils/map-region.ts): én klinik ca. 1 km (regionForClinic), flere klinikker med luft
// omkring og højst ca. 2 km (MIN_DELTA).
export const SINGLE_CLINIC_ZOOM = 15;
export const MAX_FIT_ZOOM = 14;

export type MapPoint = { id: string; lat: number; lng: number };

// Klinikker med kortplacering. Klinikker uden placering vises kun i listen.
export function mapPoints(clinics: readonly ClinicListItemDto[]): MapPoint[] {
  return clinics.flatMap((clinic) => (clinic.location ? [{ id: clinic.id, ...clinic.location }] : []));
}
