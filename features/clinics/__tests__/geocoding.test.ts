import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FakeGeocodingService, fakeGeocodePoint } from "@/features/clinics/fakeGeocodingService";
import { createGeocodingService } from "@/features/clinics/geocoding";
import { type AddressQuery, type GeocodeHit, GeocodingService } from "@/features/clinics/geocodingService";
import {
  NOMINATIM_USER_AGENT,
  NominatimGeocodingService,
  type NominatimOptions,
  parseNominatimResponse,
} from "@/features/clinics/nominatimGeocodingService";

// Adresseopslaget (clinics 4.3). Ingen netværkskald: fetch erstattes i alle tests.

const QUERY: AddressQuery = { address: "Nørrebrogade 20", postalCode: "2200", city: "København N" };
const MIDPOINT_2200 = { lat: 55.6948, lng: 12.5503 };

function nominatimHit(lat: string, lon: string, postcode = "2200") {
  return [{ lat, lon, display_name: "20, Nørrebrogade, København", address: { road: "Nørrebrogade", postcode } }];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Nominatim-klient med falsk fetch, ur og pause (ingen rigtig ventetid).
function nominatim(fetchImpl: NominatimOptions["fetch"], extra: Partial<NominatimOptions> = {}) {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const service = new NominatimGeocodingService({
    fetch: fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    throttle: { nextAt: 0 },
    ...extra,
  });
  return { service, sleeps, advance: (ms: number) => (clock += ms) };
}

describe("parseNominatimResponse", () => {
  it("læser lat, lon og postnummer fra første træf", () => {
    expect(parseNominatimResponse(nominatimHit("55.6881770", "12.5602770"))).toEqual({ lat: 55.688177, lng: 12.560277, postalCode: "2200" });
  });

  it("giver null for tomt svar, forkert form og ugyldige tal", () => {
    expect(parseNominatimResponse([])).toBeNull();
    expect(parseNominatimResponse({ error: "Bad request" })).toBeNull();
    expect(parseNominatimResponse(null)).toBeNull();
    expect(parseNominatimResponse([null])).toBeNull();
    expect(parseNominatimResponse([{ lat: "abc", lon: "12.5" }])).toBeNull();
    expect(parseNominatimResponse([{ lat: "55.6" }])).toBeNull();
  });

  it("postnummer er null, når det mangler eller ikke er fire cifre", () => {
    expect(parseNominatimResponse([{ lat: "55.6", lon: "12.5" }])?.postalCode).toBeNull();
    expect(parseNominatimResponse([{ lat: "55.6", lon: "12.5", address: { postcode: "DK-2200 København" } }])?.postalCode).toBe("2200");
    expect(parseNominatimResponse([{ lat: "55.6", lon: "12.5", address: { postcode: "22" } }])?.postalCode).toBeNull();
  });
});

describe("NominatimGeocodingService", () => {
  it("sender struktureret søgning med User-Agent og returnerer placeringen", async () => {
    const fetchMock = vi.fn<NominatimOptions["fetch"]>(async () => jsonResponse(nominatimHit("55.688177", "12.560277")));
    const { service } = nominatim(fetchMock);
    await expect(service.locate(QUERY, MIDPOINT_2200)).resolves.toEqual({ lat: 55.688177, lng: 12.560277 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      street: "Nørrebrogade 20",
      postalcode: "2200",
      city: "København N",
      countrycodes: "dk",
      format: "jsonv2",
      addressdetails: "1",
      limit: "1",
    });
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(NOMINATIM_USER_AGENT);
    expect(NOMINATIM_USER_AGENT).toContain("kontakt@tandmatch.dk");
  });

  it("prøver én gang uden by, når der ikke er træf med by, og venter 1 s mellem kaldene", async () => {
    const fetchMock = vi
      .fn<NominatimOptions["fetch"]>()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(nominatimHit("55.6751", "12.5660", "1620")));
    const { service, sleeps } = nominatim(fetchMock);
    const found = await service.locate({ address: "Vesterbrogade 1", postalCode: "1620", city: "København V" }, { lat: 55.6717, lng: 12.5534 });
    expect(found).toEqual({ lat: 55.6751, lng: 12.566 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.has("city")).toBe(false);
    expect(sleeps).toEqual([1000]);
  });

  it("ikke fundet giver null (midtpunktet bruges)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    const { service } = nominatim(fetchMock);
    await expect(service.locate({ address: "Demovej 10", postalCode: "2200", city: "København N" }, MIDPOINT_2200)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("afviser et træf med andet postnummer langt væk (samme vejnavn i en anden by)", async () => {
    // Nominatim fandt "Nørrebrogade 20" i Randers for postnummer 9000.
    const fetchMock = vi.fn(async () => jsonResponse(nominatimHit("56.46825", "10.038608", "8900")));
    const { service } = nominatim(fetchMock);
    await expect(service.locate({ address: "Nørrebrogade 20", postalCode: "9000", city: "Aalborg" }, { lat: 57.0394, lng: 9.9135 })).resolves.toBeNull();
  });

  it("godtager et træf med andet postnummer tæt på midtpunktet", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(nominatimHit("55.6751", "12.5660", "1608")));
    const { service } = nominatim(fetchMock);
    await expect(service.locate({ address: "Vesterbrogade 1", postalCode: "1620", city: "København V" }, { lat: 55.6717, lng: 12.5534 })).resolves.toEqual({
      lat: 55.6751,
      lng: 12.566,
    });
  });

  it("afviser punkter uden for Danmark", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(nominatimHit("52.52", "13.405", "2200")));
    const { service } = nominatim(fetchMock);
    await expect(service.locate(QUERY, MIDPOINT_2200)).resolves.toBeNull();
  });

  it("HTTP-fejl og netværksfejl giver null og prøves ikke igen", async () => {
    const http = vi.fn(async () => jsonResponse({ error: "busy" }, 503));
    await expect(nominatim(http).service.locate(QUERY, MIDPOINT_2200)).resolves.toBeNull();
    expect(http).toHaveBeenCalledTimes(1);
    const network = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(nominatim(network).service.locate(QUERY, MIDPOINT_2200)).resolves.toBeNull();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("afbryder efter timeout og giver null", async () => {
    // fetch, der aldrig svarer, før signalet afbryder den.
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    const { service } = nominatim(hanging, { timeoutMs: 20 });
    const started = Date.now();
    await expect(service.locate(QUERY, MIDPOINT_2200)).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(hanging).toHaveBeenCalledTimes(1);
  });

  it("højst ét kald pr. sekund på tværs af opslag; springer over, hvis køen er for lang", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(nominatimHit("55.688177", "12.560277")));
    const throttle = { nextAt: 0 };
    let clock = 0;
    const sleeps: number[] = [];
    // Uret står stille under pausen, så tre samtidige opslag skal vente 0, 1 og 2 s; et fjerde (3 s) springes over.
    const make = () =>
      new NominatimGeocodingService({ fetch: fetchMock, now: () => clock, sleep: async (ms) => void sleeps.push(ms), throttle, maxWaitMs: 2000 });
    const results = await Promise.all([make(), make(), make(), make()].map((s) => s.locate(QUERY, MIDPOINT_2200)));
    expect(sleeps).toEqual([1000, 2000]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    clock = 10_000;
    await expect(make().locate(QUERY, MIDPOINT_2200)).resolves.not.toBeNull();
  });
});

describe("GeocodingService.locate", () => {
  class Throwing extends GeocodingService {
    protected async lookup(): Promise<GeocodeHit | null> {
      throw new Error("bum");
    }
  }

  it("kaster aldrig videre", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(new Throwing().locate(QUERY, null)).resolves.toBeNull();
    // Adressen logges ikke.
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("Nørrebrogade");
    warn.mockRestore();
  });
});

describe("FakeGeocodingService og createGeocodingService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("finder kun Kortvej-adresser, deterministisk", async () => {
    const fake = new FakeGeocodingService();
    await expect(fake.locate({ address: "Kortvej 12", postalCode: "2100", city: "København Ø" }, null)).resolves.toEqual(fakeGeocodePoint(12));
    await expect(fake.locate({ address: "Testvej 1", postalCode: "2100", city: "København Ø" }, null)).resolves.toBeNull();
    expect(fake.calls).toHaveLength(2);
  });

  it("GEOCODING_FAKE=1 giver den falske klient, men ikke i produktion", () => {
    vi.stubEnv("GEOCODING_FAKE", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(createGeocodingService()).toBeInstanceOf(FakeGeocodingService);
    vi.stubEnv("NODE_ENV", "production");
    expect(createGeocodingService()).toBeInstanceOf(NominatimGeocodingService);
    vi.stubEnv("GEOCODING_FAKE", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(createGeocodingService()).toBeInstanceOf(NominatimGeocodingService);
  });
});
