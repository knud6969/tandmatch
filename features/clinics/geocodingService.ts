import "server-only";
import { haversineKm, isInDenmark, type LatLng } from "@/lib/clinics/domain/location";

// Adresseopslag (clinics 4.3 "Placering ud fra adressen"). Basisklassen samler reglerne, så underklasserne (Nominatim i
// dag, Datafordeleren senere, en falsk i tests) kun skal slå op: et opslag kaster aldrig videre, og et træf godtages kun,
// hvis det ligger i Danmark og passer til klinikkens postnummer.

export type AddressQuery = { address: string; postalCode: string; city: string };

// Et træf fra underklassen. `postalCode` er træffets eget postnummer, hvis kilden oplyser det.
export type GeocodeHit = LatLng & { postalCode: string | null };

// Et træf med et andet postnummer godtages kun, hvis det ligger så tæt på postnummerets midtpunkt.
export const MAX_GEOCODE_DISTANCE_KM = 15;

export abstract class GeocodingService {
  // Slår adressen op. Må kaste (timeout, netværk, ugyldigt svar); `locate()` fanger det. null = ikke fundet.
  protected abstract lookup(query: AddressQuery): Promise<GeocodeHit | null>;

  // Klinikkens placering ud fra adressen, eller null (ikke fundet, fejl eller utroværdigt træf). `near` er postnummerets
  // midtpunkt (eller den nuværende placering), som et træf med andet postnummer skal ligge tæt på.
  async locate(query: AddressQuery, near: LatLng | null): Promise<LatLng | null> {
    let hit: GeocodeHit | null;
    try {
      hit = await this.lookup(query);
    } catch (error) {
      // Kun fejlens navn logges, aldrig adressen.
      console.warn(`Adresseopslag fejlede (${error instanceof Error ? error.name : "ukendt fejl"}); postnummerets midtpunkt bruges.`);
      return null;
    }
    if (!hit || !isInDenmark(hit)) return null;
    const samePostalCode = hit.postalCode === query.postalCode;
    const close = near !== null && haversineKm(near, hit) <= MAX_GEOCODE_DISTANCE_KM;
    return samePostalCode || close ? { lat: hit.lat, lng: hit.lng } : null;
  }
}
