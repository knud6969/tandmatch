import { caseFilterKey, DEFAULT_FILTERS, filtersForCase, shouldApplyCase, type DirectoryFilters } from "~/utils/clinic-filters";

const sag = (postalCode: string | null, ...slugs: string[]) => ({ postalCode, services: slugs.map((slug) => ({ slug })) });

// Gamle filtre fra "Jeg har ondt" og fri brug af fanen.
const stale: DirectoryFilters = {
  serviceSlugs: ["rodbehandling"],
  postalCode: "8000",
  position: { lat: 55.7, lng: 12.5 },
  maxDistanceKm: 5,
  emergency: true,
  sort: "first_available",
  onlyOffering: false,
};

describe("filtersForCase", () => {
  it("nulstiller akut, sortering, afstand og position og bruger kun sagens behandlinger og postnummer", () => {
    const f = filtersForCase(sag("2100", "undersogelse", "tandrensning"));
    expect(f).toEqual({ ...DEFAULT_FILTERS, serviceSlugs: ["undersogelse", "tandrensning"], postalCode: "2100", onlyOffering: true });
    expect(f.emergency).toBe(false);
    expect(f.sort).toBeNull();
    expect(f.position).toBeNull();
    expect(f.maxDistanceKm).toBe(DEFAULT_FILTERS.maxDistanceKm);
  });

  it("er uafhængig af de gamle filtre (de indgår ikke)", () => {
    expect(filtersForCase(sag("2100", "undersogelse"))).not.toMatchObject({ emergency: stale.emergency, position: stale.position });
  });

  it("giver intet postnummer og ingen position, når sagen mangler postnummer", () => {
    const f = filtersForCase(sag(null, "undersogelse"));
    expect(f.postalCode).toBe("");
    expect(f.position).toBeNull();
  });

  it("en ny sag giver nye behandlinger og postnummer", () => {
    expect(filtersForCase(sag("2100", "a"))).toMatchObject({ serviceSlugs: ["a"], postalCode: "2100" });
    expect(filtersForCase(sag("8000", "b", "c"))).toMatchObject({ serviceSlugs: ["b", "c"], postalCode: "8000" });
  });
});

describe("caseFilterKey og shouldApplyCase", () => {
  it("anvender første gang og ved ny sag", () => {
    expect(shouldApplyCase(null, caseFilterKey("s1", sag("2100", "a")))).toBe(true);
    expect(shouldApplyCase(caseFilterKey("s1", sag("2100", "a")), caseFilterKey("s2", sag("2100", "a")))).toBe(true);
  });

  it("anvender igen, når behandlinger eller postnummer er ændret på samme sag", () => {
    const old = caseFilterKey("s1", sag("2100", "a"));
    expect(shouldApplyCase(old, caseFilterKey("s1", sag("2100", "a", "b")))).toBe(true);
    expect(shouldApplyCase(old, caseFilterKey("s1", sag("8000", "a")))).toBe(true);
  });

  it("bevarer patientens egne filterændringer, når sagen er uændret (også ved anden rækkefølge)", () => {
    const old = caseFilterKey("s1", sag("2100", "a", "b"));
    expect(shouldApplyCase(old, caseFilterKey("s1", sag("2100", "b", "a")))).toBe(false);
  });
});
