import type { ClinicListItemDto } from "@/lib/types/clinics";

// Kortindstillinger (OpenStreetMap med Leaflet, architecture 6.6). Ingen API-nøgle. Fliserne hentes direkte af browseren
// fra OSM's offentlige fliseserver (kræver `img-src https://tile.openstreetmap.org` i CSP, next.config.ts).
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_MAX_ZOOM = 19;

// Kreditering, der altid skal være synlig (OSM's licens).
export const MAP_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap-bidragydere</a>';

// Danmark som udgangsvisning, når der ingen markører er.
export const DENMARK_CENTER: [number, number] = [56.0, 10.5];
export const DENMARK_ZOOM = 7;

export type MapPoint = { id: string; lat: number; lng: number };

// Klinikker med kortplacering. Klinikker uden placering vises kun i listen.
export function mapPoints(clinics: readonly ClinicListItemDto[]): MapPoint[] {
  return clinics.flatMap((clinic) => (clinic.location ? [{ id: clinic.id, ...clinic.location }] : []));
}
