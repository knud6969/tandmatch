import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import {
  clampRadiusKm, clinicsWithLocation, DENMARK_REGION, directionsUrl, MIN_DELTA, radiusLabel, regionForClinic, regionForClinics, regionForRadius, regionKey, resolveOrigin,
} from "~/utils/map-region";

const clinic = (id: string, location: { lat: number; lng: number } | null) => ({ id, location }) as unknown as ClinicListItemDto;

describe("kortudsnit", () => {
  it("falder tilbage til Danmark uden klinikker og udgangspunkt", () => {
    expect(regionForClinics([], null)).toEqual(DENMARK_REGION);
    expect(regionForClinics([clinic("a", null)], null)).toEqual(DENMARK_REGION);
  });

  it("springer klinikker uden lokation over", () => {
    expect(clinicsWithLocation([clinic("a", null), clinic("b", { lat: 55.7, lng: 12.5 })]).map((c) => c.id)).toEqual(["b"]);
  });

  it("giver et minimumsudsnit for én klinik", () => {
    const r = regionForClinics([clinic("a", { lat: 55.7, lng: 12.5 })], null);
    expect(r).toMatchObject({ latitude: 55.7, longitude: 12.5, latitudeDelta: MIN_DELTA, longitudeDelta: MIN_DELTA });
  });

  it("omfatter klinikker og udgangspunkt med luft", () => {
    const r = regionForClinics([clinic("a", { lat: 55.6, lng: 12.4 })], { lat: 55.8, lng: 12.6 });
    expect(r.latitude).toBeCloseTo(55.7);
    expect(r.longitude).toBeCloseTo(12.5);
    expect(r.latitudeDelta).toBeCloseTo(0.28);
    expect(r.longitudeDelta).toBeCloseTo(0.28);
  });

  it("nøglen ændres med klinikker og udgangspunkt, men ikke med rækkefølge af uvedkommende felter", () => {
    const a = clinic("a", { lat: 1, lng: 2 });
    expect(regionKey([a], null)).toBe(regionKey([{ ...a }], null));
    expect(regionKey([a], null)).not.toBe(regionKey([a], { lat: 1, lng: 2 }));
    expect(regionKey([a, clinic("b", { lat: 1, lng: 2 })], null)).not.toBe(regionKey([a], null));
  });

  it("zoomer ind på én klinik og bygger vejvisning", () => {
    expect(regionForClinic({ lat: 55.7, lng: 12.5 })).toMatchObject({ latitude: 55.7, longitude: 12.5 });
    expect(directionsUrl({ lat: 55.7, lng: 12.5 }, "Tand & Co")).toBe("https://maps.apple.com/?daddr=55.7,12.5&dirflg=d&q=Tand%20%26%20Co");
  });
});

describe("radius på kortet", () => {
  it("runder og holder radius mellem 1 og 50 km", () => {
    expect(clampRadiusKm(0)).toBe(1);
    expect(clampRadiusKm(12.4)).toBe(12);
    expect(clampRadiusKm(12.6)).toBe(13);
    expect(clampRadiusKm(500)).toBe(50);
    expect(clampRadiusKm(Number.NaN)).toBe(1);
  });

  it("viser radius som tekst", () => {
    expect(radiusLabel(12)).toBe("Inden for 12 km");
  });

  it("zoomer ud, jo større radius er", () => {
    const origin = { lat: 55.68, lng: 12.57 };
    const small = regionForRadius(origin, 2);
    const large = regionForRadius(origin, 20);
    expect(large.latitudeDelta).toBeGreaterThan(small.latitudeDelta);
    expect(large.longitudeDelta).toBeGreaterThan(large.latitudeDelta);
    expect(small.latitude).toBe(55.68);
    expect(regionForRadius(origin, 1).latitudeDelta).toBeGreaterThanOrEqual(MIN_DELTA);
  });

  it("bruger serverens origin, ellers positionen", () => {
    const position = { lat: 1, lng: 2 };
    expect(resolveOrigin({ origin: { lat: 55, lng: 12 } }, position)).toEqual({ lat: 55, lng: 12 });
    expect(resolveOrigin({ origin: null }, position)).toEqual(position);
    expect(resolveOrigin({}, null)).toBeNull();
    expect(resolveOrigin(null, position)).toEqual(position);
  });
});
