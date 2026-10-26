import { describe, expect, it } from "vitest";
import { appleMapsDirectionsUrl, googleMapsDirectionsUrl } from "@/lib/clinics/domain/directions";
import { haversineKm, isInDenmark } from "@/lib/clinics/domain/location";

// Vejvisningslinks (clinics 6.3) og Danmarks-tjekket (4.3). Appen bruger samme funktion (mobile/tests/map-region.test.ts).
describe("vejvisning", () => {
  it("Google Maps med destination", () => {
    expect(googleMapsDirectionsUrl({ lat: 55.6881, lng: 12.5603 })).toBe("https://www.google.com/maps/dir/?api=1&destination=55.6881,12.5603");
  });

  it("Apple Maps med kørselsvejledning og kodet navn", () => {
    expect(appleMapsDirectionsUrl({ lat: 55.7, lng: 12.5 }, "Tand & Co Ø")).toBe(
      "https://maps.apple.com/?daddr=55.7,12.5&dirflg=d&q=Tand%20%26%20Co%20%C3%98",
    );
  });
});

describe("placering", () => {
  it("isInDenmark", () => {
    expect(isInDenmark({ lat: 55.68, lng: 12.57 })).toBe(true);
    expect(isInDenmark({ lat: 55.1, lng: 14.9 })).toBe(true); // Bornholm
    expect(isInDenmark({ lat: 52.52, lng: 13.4 })).toBe(false);
    expect(isInDenmark({ lat: Number.NaN, lng: 12 })).toBe(false);
  });

  it("haversineKm København-Aarhus ca. 157 km", () => {
    expect(Math.round(haversineKm({ lat: 55.6761, lng: 12.5683 }, { lat: 56.1535, lng: 10.2034 }))).toBe(157);
  });
});
