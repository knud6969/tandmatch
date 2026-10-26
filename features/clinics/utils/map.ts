import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";

// Kortindstillinger (Leaflet, clinics 6.6). Baggrundskortet er vektorfliser fra OpenFreeMap (gratis, ingen nøgle, data fra
// OpenStreetMap), tegnet af MapLibre GL under Leaflets markører (@maplibre/maplibre-gl-leaflet). Stilen "positron" er lys og
// rolig med tydelige vejnavne, som appens Apple Maps. Stil, fliser, skrifttyper og ikoner hentes fra tiles.openfreemap.org
// (CSP connect-src; MapLibre bruger web workers, CSP worker-src, next.config.ts).
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const MAP_MAX_ZOOM = 19;

// Kreditering, der altid skal være synlig (OpenFreeMap, OpenMapTiles og OpenStreetMaps licens).
export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> ' +
  '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> ' +
  'Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap-bidragydere</a>';

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
