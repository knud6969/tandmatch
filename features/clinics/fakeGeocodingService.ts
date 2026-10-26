import "server-only";
import { type AddressQuery, type GeocodeHit, GeocodingService } from "@/features/clinics/geocodingService";

// Falsk adresseopslag til tests (clinics 4.3). Bruger intet netværk. Vælges af createGeocodingService() (geocoding.ts),
// når GEOCODING_FAKE=1 og NODE_ENV ikke er production.
// Markør: adresser på formen "Kortvej <n>" findes med punktet 55.6761 + n/10000, 12.5683 + n/10000 (Københavns centrum
// forskudt) og det angivne postnummer; alt andet findes ikke (så bruges postnummerets midtpunkt).
export const FAKE_GEOCODE_ORIGIN = { lat: 55.6761, lng: 12.5683 } as const;

export function fakeGeocodePoint(n: number): { lat: number; lng: number } {
  return { lat: FAKE_GEOCODE_ORIGIN.lat + n / 10000, lng: FAKE_GEOCODE_ORIGIN.lng + n / 10000 };
}

export class FakeGeocodingService extends GeocodingService {
  // Alle opslag, så tests kan se, hvad der ville være sendt.
  readonly calls: AddressQuery[] = [];

  protected async lookup(query: AddressQuery): Promise<GeocodeHit | null> {
    this.calls.push(query);
    const match = /^Kortvej (\d{1,4})$/i.exec(query.address.trim());
    if (!match) return null;
    return { ...fakeGeocodePoint(Number(match[1])), postalCode: query.postalCode };
  }
}
