import type { LatLng } from "@/lib/clinics/domain/location";

// Vejvisning til en klinik i en kortapp (clinics 6.3). Bruges af webprofilen (begge links) og af appen ("Vis vej" åbner
// Apple Maps). Koordinaterne skrives, som de er; navnet følger med til Apple Maps, så kortet viser klinikkens navn.

export function googleMapsDirectionsUrl(location: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
}

export function appleMapsDirectionsUrl(location: LatLng, name: string): string {
  return `https://maps.apple.com/?daddr=${location.lat},${location.lng}&dirflg=d&q=${encodeURIComponent(name)}`;
}
