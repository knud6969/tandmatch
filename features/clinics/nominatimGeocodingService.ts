import "server-only";
import { type AddressQuery, type GeocodeHit, GeocodingService } from "@/features/clinics/geocodingService";

// Adresseopslag hos OpenStreetMap Nominatim (clinics 4.3). Brugspolitikken (https://operations.osmfoundation.org/policies/nominatim/)
// overholdes: tydelig User-Agent med kontakt, højst 1 kald pr. sekund, kort timeout og ingen gentagelser ved fejl.

export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
export const NOMINATIM_USER_AGENT = "TandMatch/0.1 (kontakt@tandmatch.dk)";

// Tidspladsen deles af alle opslag i serverprocessen, så grænsen på 1 kald/s gælder samlet (platform 2.1.1, undtagelse).
export type RequestThrottle = { nextAt: number };
const SHARED_THROTTLE: RequestThrottle = { nextAt: 0 };

export type NominatimOptions = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  throttle: RequestThrottle;
  timeoutMs: number;
  minIntervalMs: number;
  // Må et kald vente længere end dette på sin tidsplads, springes opslaget over (gemningen skal ikke vente længe).
  maxWaitMs: number;
};

const DEFAULTS: NominatimOptions = {
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  throttle: SHARED_THROTTLE,
  timeoutMs: 4000,
  minIntervalMs: 1000,
  maxWaitMs: 2000,
};

// Fejl med et navn, som `locate()` logger (aldrig adressen).
function namedError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

// Første træf i et svar fra /search?format=jsonv2&addressdetails=1, eller null. Ugyldige felter giver null.
export function parseNominatimResponse(body: unknown): GeocodeHit | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const first: unknown = body[0];
  if (typeof first !== "object" || first === null) return null;
  const record = first as { lat?: unknown; lon?: unknown; address?: unknown };
  const lat = typeof record.lat === "string" || typeof record.lat === "number" ? Number(record.lat) : NaN;
  const lng = typeof record.lon === "string" || typeof record.lon === "number" ? Number(record.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = typeof record.address === "object" && record.address !== null ? (record.address as { postcode?: unknown }) : {};
  const postalCode = typeof address.postcode === "string" ? (/\b(\d{4})\b/.exec(address.postcode)?.[1] ?? null) : null;
  return { lat, lng, postalCode };
}

export class NominatimGeocodingService extends GeocodingService {
  private readonly options: NominatimOptions;

  constructor(options: Partial<NominatimOptions> = {}) {
    super();
    this.options = { ...DEFAULTS, ...options };
  }

  // Struktureret søgning med vej, postnummer og by. Danske bynavne med bydel ("København V") matcher ofte ikke, så uden
  // træf prøves én gang uden by. En fejl (timeout, HTTP-fejl) prøves ikke igen.
  protected async lookup(query: AddressQuery): Promise<GeocodeHit | null> {
    const params = { street: query.address.trim(), postalcode: query.postalCode.trim() };
    const city = query.city.trim();
    const hit = await this.search(city ? { ...params, city } : params);
    if (hit || !city) return hit;
    return this.search(params);
  }

  private async search(fields: Record<string, string>): Promise<GeocodeHit | null> {
    await this.waitForSlot();
    const url = new URL(NOMINATIM_SEARCH_URL);
    url.search = new URLSearchParams({ ...fields, countrycodes: "dk", format: "jsonv2", addressdetails: "1", limit: "1" }).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.options.fetch(url, {
        headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json", "Accept-Language": "da" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw namedError("NominatimHttpError", `HTTP ${response.status}`);
      return parseNominatimResponse(await response.json());
    } finally {
      clearTimeout(timer);
    }
  }

  // Reserverer næste ledige tidsplads (mindst minIntervalMs mellem kald) og venter på den.
  private async waitForSlot(): Promise<void> {
    const { now, sleep, throttle, minIntervalMs, maxWaitMs } = this.options;
    const current = now();
    const slot = Math.max(current, throttle.nextAt);
    const wait = slot - current;
    if (wait > maxWaitMs) throw namedError("GeocodingThrottledError", "For mange adresseopslag lige nu");
    throttle.nextAt = slot + minIntervalMs;
    if (wait > 0) await sleep(wait);
  }
}
