import { MAX_SELECTED_SERVICES } from "@/lib/clinics/constants/clinics";
import { activeFilterCount, buildClinicsQuery, canSortBy, canWidenDistance, DEFAULT_FILTERS, sameServices, searchSummary, showOtherClinics, toggleService, widenDistance } from "~/utils/clinic-filters";
import { lacksPriceForSelection } from "~/utils/lead-selection";

// Sikrer, at filtrene giver samme forespørgsel som weben, og at meningsløse parametre udelades.
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
    expect(q).toBe("services=undersoegelse%2Cfyldning&emergency=true&onlyOffering=true&sort=price");
  });

  it("udelader sortering, der ikke giver mening", () => {
    expect(buildClinicsQuery({ ...DEFAULT_FILTERS, sort: "distance" })).toBe("");
    expect(buildClinicsQuery({ ...DEFAULT_FILTERS, sort: "price" })).toBe("");
    expect(buildClinicsQuery({ ...DEFAULT_FILTERS, postalCode: "2100", sort: "distance" })).toContain("sort=distance");
  });
});

// Sikrer, at behandlingsvalget holder sig inden for loftet og nulstiller prissortering uden behandlinger.
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

// Sikrer, at sorteringsregler og filtertælleren stemmer med filtrene.
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

// 9.9: kun true slår filteret til, og kun med valgte behandlinger (uden dem giver serveren 400).
describe("onlyOffering (13.4a)", () => {
  const sag = { ...DEFAULT_FILTERS, serviceSlugs: ["fast_bojle"], postalCode: "2100" };

  it("sendes med sagens behandlinger og postnummer", () => {
    expect(buildClinicsQuery(sag)).toBe("services=fast_bojle&postalCode=2100&maxDistanceKm=50&onlyOffering=true");
  });

  it("sendes aldrig uden behandlinger", () => {
    expect(buildClinicsQuery({ ...DEFAULT_FILTERS, postalCode: "2100" })).not.toContain("onlyOffering");
  });

  it("'Vis også andre klinikker' giver samme kald uden onlyOffering", () => {
    const q = buildClinicsQuery(showOtherClinics(sag));
    expect(q).toBe("services=fast_bojle&postalCode=2100&maxDistanceKm=50");
  });

  it("'Øg afstanden' giver 100 km og kun når der er udgangspunkt og plads til mere", () => {
    expect(canWidenDistance(DEFAULT_FILTERS)).toBe(false);
    expect(canWidenDistance(sag)).toBe(true);
    expect(buildClinicsQuery(widenDistance(sag))).toContain("maxDistanceKm=100");
    expect(canWidenDistance(widenDistance(sag))).toBe(false);
  });

  it("'Vælg klinik' slås fra uden pris på valget, men kun når der er valgte behandlinger", () => {
    expect(lacksPriceForSelection({ priceForSelection: null }, true)).toBe(true);
    expect(lacksPriceForSelection({ priceForSelection: { min: 1, max: 2 } }, true)).toBe(false);
    expect(lacksPriceForSelection({ priceForSelection: null }, false)).toBe(false);
  });
});

describe("sagens behandlinger og filtre", () => {
  it("tæller 'kun klinikker med pris' slået fra som et ændret filter", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, onlyOffering: false })).toBe(1);
  });

  it("sameServices sammenligner uden hensyn til rækkefølge", () => {
    expect(sameServices(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameServices(["a"], ["a", "b"])).toBe(false);
    expect(sameServices([], ["a"])).toBe(false);
  });
});

describe("searchSummary", () => {
  const names = new Map([["rodbehandling", "Rodbehandling"]]);

  it("viser behandlinger, postnummer, afstand og akut", () => {
    const lines = searchSummary({ ...DEFAULT_FILTERS, serviceSlugs: ["rodbehandling", "ukendt"], postalCode: "2100" }, names);
    expect(lines).toEqual([
      { label: "Behandlinger", value: "Rodbehandling, ukendt" },
      { label: "Udgangspunkt", value: "postnummer 2100" },
      { label: "Afstand", value: "op til 50 km" },
      { label: "Akut", value: "slået fra" },
    ]);
  });

  it("foretrækker position og viser akut slået til", () => {
    const lines = searchSummary({ ...DEFAULT_FILTERS, postalCode: "2100", position: { lat: 55.7, lng: 12.5 }, emergency: true }, names);
    expect(lines).toContainEqual({ label: "Udgangspunkt", value: "din position" });
    expect(lines).toContainEqual({ label: "Akut", value: "slået til" });
  });

  it("siger det, når der ikke er noget udgangspunkt", () => {
    const lines = searchSummary(DEFAULT_FILTERS, names);
    expect(lines.find((l) => l.label === "Udgangspunkt")?.value).toMatch(/intet postnummer eller position/);
    expect(lines.some((l) => l.label === "Afstand")).toBe(false);
  });
});
