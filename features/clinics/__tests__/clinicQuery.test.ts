import { describe, expect, it } from "vitest";
import { buildClinicQuery, canSortClinicsBy, type ClinicQueryFilters } from "@/lib/clinics/domain/clinic-query";

const base: ClinicQueryFilters = { serviceSlugs: [], postalCode: "", position: null, maxDistanceKm: 25, emergency: false, sort: null };

describe("buildClinicQuery (fælles for web og app)", () => {
  it("giver en tom forespørgsel uden filtre", () => {
    expect(buildClinicQuery(base)).toBe("");
  });

  it("sender behandlinger og postnummer med afstand", () => {
    const query = new URLSearchParams(buildClinicQuery({ ...base, serviceSlugs: ["a", "b"], postalCode: "2100" }));
    expect(query.get("services")).toBe("a,b");
    expect(query.get("postalCode")).toBe("2100");
    expect(query.get("maxDistanceKm")).toBe("25");
  });

  it("foretrækker position frem for postnummer", () => {
    const query = new URLSearchParams(buildClinicQuery({ ...base, postalCode: "2100", position: { lat: 55.5, lng: 12.5 } }));
    expect(query.get("lat")).toBe("55.5");
    expect(query.get("lng")).toBe("12.5");
    expect(query.has("postalCode")).toBe(false);
  });

  it("sender pris og onlyOffering kun med behandlinger", () => {
    const filters = { ...base, maxPrice: 900, onlyOffering: true };
    expect(buildClinicQuery(filters)).toBe("");
    const query = new URLSearchParams(buildClinicQuery({ ...filters, serviceSlugs: ["a"] }));
    expect(query.get("maxPrice")).toBe("900");
    expect(query.get("onlyOffering")).toBe("true");
  });

  it("sender stjerner, akut og kan kontaktes, og udelader felter, der ikke er sat", () => {
    const query = new URLSearchParams(buildClinicQuery({ ...base, minStars: 4, emergency: true, contactableOnly: true }));
    expect(query.get("minStars")).toBe("4");
    expect(query.get("emergency")).toBe("true");
    expect(query.get("contactableOnly")).toBe("true");
    expect(query.has("onlyOffering")).toBe(false);
  });

  it("sender kun sortering, der giver mening", () => {
    expect(buildClinicQuery({ ...base, sort: "distance" })).toBe("");
    expect(buildClinicQuery({ ...base, sort: "price" })).toBe("");
    expect(buildClinicQuery({ ...base, sort: "distance", postalCode: "2100" })).toContain("sort=distance");
    expect(buildClinicQuery({ ...base, sort: "price", serviceSlugs: ["a"] })).toContain("sort=price");
    expect(canSortClinicsBy(base, "rating")).toBe(true);
  });
});
