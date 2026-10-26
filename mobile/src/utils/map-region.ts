import { MAX_RADIUS_KM, MIN_RADIUS_KM } from "@/lib/clinics/constants/clinics";
import type { ClinicListDto, ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { appleMapsDirectionsUrl } from "@/lib/clinics/domain/directions";

// Grænserne ligger i lib, så rodens API-test kan læse clinic-filters.ts; genudstilles her for appens skærme.
export { MAX_RADIUS_KM, MIN_RADIUS_KM };

export type LatLng = { lat: number; lng: number };
export type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

// Danmark som reserve, når der hverken er klinikker eller udgangspunkt (kortet er aldrig tomt og hvidt).
export const DENMARK_REGION: MapRegion = { latitude: 56.0, longitude: 10.5, latitudeDelta: 4.5, longitudeDelta: 4.5 };
// Mindste udsnit (ca. 2 km), så en enkelt klinik ikke giver et ekstremt zoom.
export const MIN_DELTA = 0.02;
// Luft rundt om yderste markør, så markører ikke sidder i kanten.
const PADDING_FACTOR = 1.4;

export type MapClinic = ClinicListItemDto & { location: LatLng };

// Kun klinikker med lokation kan stå på kortet; resten findes stadig i listen.
export function clinicsWithLocation(clinics: ClinicListItemDto[]): MapClinic[] {
  return clinics.filter((c): c is MapClinic => c.location !== null);
}

// Udsnit der viser alle punkter (klinikker og evt. udgangspunkt) med luft omkring.
export function regionForPoints(points: LatLng[]): MapRegion {
  if (points.length === 0) return DENMARK_REGION;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING_FACTOR, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING_FACTOR, MIN_DELTA),
  };
}

// Udsnit for oversigten: klinikkerne med lokation plus patientens udgangspunkt, hvis vi kender det.
export function regionForClinics(clinics: ClinicListItemDto[], origin: LatLng | null): MapRegion {
  const points = clinicsWithLocation(clinics).map((c) => c.location);
  return regionForPoints(origin ? [...points, origin] : points);
}

// Stabil nøgle for det, udsnittet bygger på; kortet flytter sig kun, når den ændres (ikke ved hvert tryk på en markør).
export function regionKey(clinics: ClinicListItemDto[], origin: LatLng | null): string {
  const ids = clinicsWithLocation(clinics).map((c) => c.id).join(",");
  return `${ids}|${origin ? `${origin.lat},${origin.lng}` : ""}`;
}

// Udsnit for én klinik på profilen (ca. 1 km).
export function regionForClinic(location: LatLng): MapRegion {
  return { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 };
}

// Vejvisning i telefonens kortapp (Apple Maps på iOS). Klinikkens navn følger med. Samme URL-bygger som webprofilens link
// "Vejvisning i Apple Maps" (lib/clinics/domain/directions.ts, clinics 6.3).
export const directionsUrl: (location: LatLng, name: string) => string = appleMapsDirectionsUrl;

// Radius på kortet: 1 til 50 km i hele kilometer.

// Runder til hele km og holder værdien inden for skyderens grænser.
export function clampRadiusKm(value: number): number {
  if (!Number.isFinite(value)) return MIN_RADIUS_KM;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(value)));
}

// "Inden for 12 km" (bruges i skyderens label og i listen).
export const radiusLabel = (km: number): string => `Inden for ${km} km`;

// Udsnit der viser hele cirklen omkring udgangspunktet med lidt luft.
export function regionForRadius(origin: LatLng, km: number): MapRegion {
  const latitudeDelta = Math.max(((km * 2) / 111) * 1.25, MIN_DELTA);
  const cos = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.1);
  return { latitude: origin.lat, longitude: origin.lng, latitudeDelta, longitudeDelta: latitudeDelta / cos };
}

// Udgangspunktet fra serverens svar (ClinicListDto.origin: positionen eller postnummerets punkt); ellers patientens position.
export function resolveOrigin(data: Pick<ClinicListDto, "origin"> | null | undefined, position: LatLng | null): LatLng | null {
  const origin = data?.origin;
  return origin ? { lat: origin.lat, lng: origin.lng } : position;
}
