import "server-only";
import { FakeGeocodingService } from "@/features/clinics/fakeGeocodingService";
import type { GeocodingService } from "@/features/clinics/geocodingService";
import { NominatimGeocodingService } from "@/features/clinics/nominatimGeocodingService";

// Vælger adresseopslaget (clinics 4.3). TEST-MULIGHED: GEOCODING_FAKE=1 giver et falsk opslag uden netværkskald, men kun
// uden for produktion (som AI_FAKE_CLIENT). Variablen sættes af tests/api/run.sh og tests/e2e/run.sh.
export function createGeocodingService(): GeocodingService {
  if (process.env.GEOCODING_FAKE === "1" && process.env.NODE_ENV !== "production") {
    return new FakeGeocodingService();
  }
  return new NominatimGeocodingService();
}
