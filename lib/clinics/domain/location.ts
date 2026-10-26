// Placering i Danmark (clinics 4.3 "Placering ud fra adressen"). Delt af serveren (adresseopslag) og rangeringen.
// Ren kode uden I/O; lib/ importerer kun lib/ og zod, fordi appen deler mappen.

export type LatLng = { lat: number; lng: number };

// Danmark inkl. Bornholm og Ertholmene. Samme grænser som set_clinic_location() i migration 20261104000100.
export const DENMARK_BOUNDS = { minLat: 54.4, maxLat: 57.9, minLng: 7.9, maxLng: 15.3 } as const;

export function isInDenmark(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= DENMARK_BOUNDS.minLat &&
    point.lat <= DENMARK_BOUNDS.maxLat &&
    point.lng >= DENMARK_BOUNDS.minLng &&
    point.lng <= DENMARK_BOUNDS.maxLng
  );
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// Afstand i km (Haversine), uafrundet.
export function haversineKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
