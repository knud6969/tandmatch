import { describe, expect, it } from "vitest";
import { CLINIC_SORTS } from "@/lib/clinics/constants/clinics";
import type { ClinicListItemDto, ClinicPriceDto } from "@/lib/clinics/types/clinics";
import { RankingService } from "@/features/clinics/rankingService";

const NOW = new Date("2026-10-14T08:00:00Z");
const ranking = new RankingService(() => NOW);

let counter = 0;
function clinic(name: string, overrides: Partial<ClinicListItemDto> = {}): ClinicListItemDto {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    name,
    tier: "full",
    canReceiveLeads: true,
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    location: null,
    phone: null,
    website: null,
    openingHours: [],
    distanceKm: null,
    trustpilot: null,
    reviewStats: null,
    logoUrl: null,
    prices: [],
    priceForSelection: null,
    firstAvailableAt: null,
    firstEmergencyAt: null,
    ...overrides,
  };
}

const stats = (avgStars: number | null, reviewCount: number, priceAccuracyPct: number | null = null) => ({
  reviewCount,
  avgStars,
  priceAccuracyPct,
  distribution: null,
});

const basic = (name: string, overrides: Partial<ClinicListItemDto> = {}) =>
  clinic(name, { tier: "basic", canReceiveLeads: false, ...overrides });

const names = (list: ClinicListItemDto[]) => list.map((c) => c.name);

describe("RankingService.rank: sorteringer", () => {
  it("price: laveste pris for valget først, uden pris sidst", () => {
    const list = [
      clinic("C", { priceForSelection: { min: 900, max: 1200 } }),
      clinic("A", { priceForSelection: null }),
      clinic("B", { priceForSelection: { min: 500, max: 2000 } }),
      basic("D"),
    ];
    expect(names(ranking.rank(list, { sort: "price" }))).toEqual(["B", "C", "A", "D"]);
  });

  it("rating: højeste gennemsnit, derefter flest anmeldelser; uden anmeldelser (også basisniveau) sidst", () => {
    const list = [
      clinic("A", { reviewStats: stats(4.5, 10) }),
      clinic("B", { reviewStats: stats(4.8, 3) }),
      clinic("C", { reviewStats: stats(4.5, 25) }),
      clinic("D", { reviewStats: stats(null, 0) }),
      basic("E"),
    ];
    expect(names(ranking.rank(list, { sort: "rating" }))).toEqual(["B", "C", "A", "D", "E"]);
  });

  it("price_accuracy: højeste procent først, uden værdi sidst", () => {
    const list = [
      clinic("A", { reviewStats: stats(4, 5, 70) }),
      clinic("B", { reviewStats: stats(4, 2, null) }), // under tre anmeldelser
      clinic("C", { reviewStats: stats(4, 9, 95) }),
      basic("D"),
    ];
    expect(names(ranking.rank(list, { sort: "price_accuracy" }))).toEqual(["C", "A", "B", "D"]);
  });

  it("distance: nærmeste først, uden afstand sidst", () => {
    const list = [clinic("A", { distanceKm: 12.5 }), clinic("B", { distanceKm: null }), basic("C", { distanceKm: 0.4 }), clinic("D", { distanceKm: 3 })];
    expect(names(ranking.rank(list, { sort: "distance" }))).toEqual(["C", "D", "A", "B"]);
  });

  it("first_available: tidligste ledige tid først, uden ledig tid sidst", () => {
    const list = [
      clinic("A", { firstAvailableAt: "2026-10-20T08:00:00.000Z" }),
      clinic("B", { firstAvailableAt: null }),
      clinic("C", { firstAvailableAt: "2026-10-15T08:00:00.000Z" }),
      basic("D"),
    ];
    expect(names(ranking.rank(list, { sort: "first_available" }))).toEqual(["C", "A", "B", "D"]);
  });

  it("first_available på akutvejen bruger første akuttid", () => {
    const list = [
      clinic("A", { firstAvailableAt: "2026-10-14T09:00:00.000Z", firstEmergencyAt: "2026-10-14T20:00:00.000Z" }),
      clinic("B", { firstAvailableAt: "2026-10-18T09:00:00.000Z", firstEmergencyAt: "2026-10-14T10:00:00.000Z" }),
    ];
    expect(names(ranking.rank(list, { sort: "first_available", filters: { emergency: true } }))).toEqual(["B", "A"]);
  });

  it("ved lighed afgør navnet (dansk sortering), også blandt dem uden værdi", () => {
    const list = [clinic("Østerbro Tand", { distanceKm: 2 }), clinic("Aarhus Tand", { distanceKm: 2 }), clinic("Ålborg Tand"), clinic("Brønshøj Tand")];
    expect(names(ranking.rank(list, { sort: "distance" }))).toEqual(["Østerbro Tand", "Aarhus Tand", "Brønshøj Tand", "Ålborg Tand"]); // "aa" sorteres som "å", efter "ø"
  });

  it("dækker alle fem sorteringer uden at ændre indgangslisten", () => {
    expect(CLINIC_SORTS).toHaveLength(5);
    const list = [clinic("B"), clinic("A")];
    const copy = [...list];
    for (const sort of CLINIC_SORTS) expect(names(ranking.rank(list, { sort }))).toEqual(["A", "B"]);
    expect(list).toEqual(copy);
  });
});

describe("RankingService.rank: filtre", () => {
  it("maxDistanceKm: fjerner for fjerne klinikker og klinikker uden afstand", () => {
    const list = [clinic("A", { distanceKm: 24.9 }), clinic("B", { distanceKm: 25 }), clinic("C", { distanceKm: 25.1 }), clinic("D")];
    expect(names(ranking.rank(list, { sort: "distance", filters: { maxDistanceKm: 25 } }))).toEqual(["A", "B"]);
  });

  it("uden maxDistanceKm bliver ingen fjernet på afstand", () => {
    const list = [clinic("A", { distanceKm: 500 }), clinic("B")];
    expect(ranking.rank(list, { sort: "distance" })).toHaveLength(2);
  });

  it("maxPrice: sammenligner med laveste pris for valget; uden pris for alle valgte ydelser falder klinikken fra", () => {
    const list = [
      clinic("A", { priceForSelection: { min: 1000, max: 3000 } }),
      clinic("B", { priceForSelection: { min: 1001, max: 1500 } }),
      clinic("C", { priceForSelection: null }),
      basic("D"),
    ];
    expect(names(ranking.rank(list, { sort: "price", filters: { maxPrice: 1000 } }))).toEqual(["A"]);
  });

  it("onlyOffering: klinik uden pris på én behandling og basisklinik falder fra; kriterielinjen vises", () => {
    const list = [
      clinic("A", { priceForSelection: { min: 1000, max: 3000 } }),
      clinic("B", { priceForSelection: null }),
      basic("C"),
    ];
    expect(names(ranking.rank(list, { sort: "price", filters: { onlyOffering: true } }))).toEqual(["A"]);
    expect(names(ranking.rank(list, { sort: "price", filters: { onlyOffering: false } }))).toHaveLength(3);
    expect(ranking.criteria("price", { onlyOffering: true })).toContain("Kun klinikker med pris på alle valgte behandlinger");
  });

  it("minStars: kun klinikker med mindst så højt gennemsnit; uden anmeldelser falder fra", () => {
    const list = [
      clinic("A", { reviewStats: stats(4.0, 4) }),
      clinic("B", { reviewStats: stats(3.9, 40) }),
      clinic("C", { reviewStats: stats(null, 0) }),
      basic("D"),
    ];
    expect(names(ranking.rank(list, { sort: "rating", filters: { minStars: 4 } }))).toEqual(["A"]);
  });

  it("emergency: kun klinikker med akuttid inden for 48 timer", () => {
    const list = [
      clinic("A", { firstEmergencyAt: "2026-10-14T08:30:00.000Z" }),
      clinic("B", { firstEmergencyAt: "2026-10-16T08:00:00.000Z" }), // nøjagtigt 48 timer
      clinic("C", { firstEmergencyAt: "2026-10-16T08:00:01.000Z" }),
      clinic("D", { firstEmergencyAt: null }),
    ];
    expect(names(ranking.rank(list, { sort: "first_available", filters: { emergency: true } }))).toEqual(["A", "B"]);
  });

  it("contactableOnly: kun verificerede klinikker", () => {
    const list = [clinic("A"), basic("B"), clinic("C")];
    expect(names(ranking.rank(list, { sort: "distance", filters: { contactableOnly: true } }))).toEqual(["A", "C"]);
    expect(ranking.rank(list, { sort: "distance" })).toHaveLength(3);
  });

  it("kombinerer filtre", () => {
    const list = [
      clinic("A", { distanceKm: 5, reviewStats: stats(4.6, 8), priceForSelection: { min: 800, max: 900 } }),
      clinic("B", { distanceKm: 40, reviewStats: stats(4.9, 8), priceForSelection: { min: 800, max: 900 } }),
      clinic("C", { distanceKm: 5, reviewStats: stats(3.0, 8), priceForSelection: { min: 800, max: 900 } }),
    ];
    const result = ranking.rank(list, { sort: "price", filters: { maxDistanceKm: 25, minStars: 4, maxPrice: 1000 } });
    expect(names(result)).toEqual(["A"]);
  });
});

describe("RankingService.priceForSelection: pris kun med alle ydelser", () => {
  const price = (serviceId: string, min: number, max: number): ClinicPriceDto => ({
    serviceId,
    serviceSlug: serviceId,
    serviceName: serviceId,
    price: { min, max },
    durationMin: 30,
    note: null,
  });
  const prices = [price("a", 500, 700), price("b", 1000, 1500), price("c", 2000, 2500)];

  it("lægger priserne for de valgte ydelser sammen", () => {
    expect(ranking.priceForSelection({ tier: "full" }, prices, ["a", "b"])).toEqual({ min: 1500, max: 2200 });
  });

  it("giver null, hvis blot én valgt ydelse mangler i prislisten", () => {
    expect(ranking.priceForSelection({ tier: "full" }, prices, ["a", "x"])).toBeNull();
  });

  it("giver null uden valgte ydelser og for basisniveau", () => {
    expect(ranking.priceForSelection({ tier: "full" }, prices, [])).toBeNull();
    expect(ranking.priceForSelection({ tier: "basic" }, prices, ["a"])).toBeNull();
  });

  it("tæller en ydelse valgt to gange én gang", () => {
    expect(ranking.priceForSelection({ tier: "full" }, prices, ["a", "a"])).toEqual({ min: 500, max: 700 });
  });
});

describe("RankingService: afstand, standardsortering og kriterier", () => {
  it("beregner afstand med Haversine, afrundet til én decimal", () => {
    // Københavns Rådhusplads til Aarhus Rådhus: ca. 157 km i luftlinje.
    const km = ranking.distanceKm({ lat: 55.6761, lng: 12.5683 }, { lat: 56.1535, lng: 10.2139 });
    expect(km).toBeGreaterThan(150);
    expect(km).toBeLessThan(165);
    expect(ranking.distanceKm({ lat: 55.7, lng: 12.5 }, { lat: 55.7, lng: 12.5 })).toBe(0);
    expect(Number.isInteger(km * 10)).toBe(true);
  });

  it("vælger afstand som standard med position, ellers første ledige tid, og altid første ledige tid på akutvejen", () => {
    expect(ranking.defaultSort({ hasOrigin: true, emergency: false })).toBe("distance");
    expect(ranking.defaultSort({ hasOrigin: false, emergency: false })).toBe("first_available");
    expect(ranking.defaultSort({ hasOrigin: true, emergency: true })).toBe("first_available");
  });

  it("beskriver sortering og filtre i klartekst", () => {
    const lines = ranking.criteria("distance", { maxDistanceKm: 25, minStars: 4, emergency: true, contactableOnly: true });
    expect(lines[0]).toBe("Sortering: Nærmeste først");
    expect(lines).toContain("Højst 25 km væk");
    expect(lines).toContain("Akuttid inden for 48 timer");
    expect(lines).toContain("Kun klinikker, der kan kontaktes");
  });
});
