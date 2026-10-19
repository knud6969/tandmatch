import { MAX_SELECTED_SERVICES } from "@/lib/constants/clinics";
import { activeFilterCount, buildClinicsQuery, canSortBy, DEFAULT_FILTERS, toggleService } from "~/utils/clinic-filters";

describe("buildClinicsQuery", () => {
  it("giver tom forespørgsel uden filtre", () => {
    expect(buildClinicsQuery(DEFAULT_FILTERS)).toBe("");
  });

  it("sender postnummer med standardafstanden, samme som GET /api/clinics?postalCode=2100", () => {
    expect(buildClinicsQuery({ ...DEFAULT_FILTERS, postalCode: "2100" })).toBe("postalCode=2100&maxDistanceKm=50");
  });

  it("foretrækker position frem for postnummer", () => {
    const q = buildClinicsQuery({ ...DEFAULT_FILTERS, postalCode: "2100", position: { lat: 55.68, lng: 12.57 } });
    expect(q).toBe("lat=55.68&lng=12.57&maxDistanceKm=50");
  });

  it("sender behandlinger, akut og sortering", () => {
    const q = buildClinicsQuery({ ...DEFAULT_FILTERS, serviceSlugs: ["undersoegelse", "fyldning"], emergency: true, sort: "price" });
    expect(q).toBe("services=undersoegelse%2Cfyldning&emergency=true&sort=price");
  });

  it("udelader sortering, der ikke giver mening", () => {
    expect(buildClinicsQuery({ ...DEFAULT_FILTERS, sort: "distance" })).toBe("");
    expect(buildClinicsQuery({ ...DEFAULT_FILTERS, sort: "price" })).toBe("");
    expect(buildClinicsQuery({ ...DEFAULT_FILTERS, postalCode: "2100", sort: "distance" })).toContain("sort=distance");
  });
});

describe("toggleService", () => {
  it("vælger og fravælger, og nulstiller prissortering uden behandlinger", () => {
    const one = toggleService(DEFAULT_FILTERS, "a");
    expect(one.serviceSlugs).toEqual(["a"]);
    const sorted = { ...one, sort: "price" as const };
    expect(toggleService(sorted, "a")).toMatchObject({ serviceSlugs: [], sort: null });
  });

  it("tillader højst MAX_SELECTED_SERVICES", () => {
    let f = DEFAULT_FILTERS;
    for (let i = 0; i < MAX_SELECTED_SERVICES + 2; i++) f = toggleService(f, `s${i}`);
    expect(f.serviceSlugs).toHaveLength(MAX_SELECTED_SERVICES);
  });
});

describe("hjælpere", () => {
  it("canSortBy kræver position til afstand og behandling til pris", () => {
    expect(canSortBy(DEFAULT_FILTERS, "distance")).toBe(false);
    expect(canSortBy({ ...DEFAULT_FILTERS, postalCode: "2100" }, "distance")).toBe(true);
    expect(canSortBy(DEFAULT_FILTERS, "price")).toBe(false);
    expect(canSortBy(DEFAULT_FILTERS, "rating")).toBe(true);
  });

  it("tæller aktive filtre", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, postalCode: "2100", emergency: true, sort: "rating", serviceSlugs: ["a"] })).toBe(4);
  });
});
