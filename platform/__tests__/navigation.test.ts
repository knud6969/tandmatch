import { describe, expect, it } from "vitest";
import { AREA_NAV, activeNavHref } from "@/lib/common/navigation/areas";

// Klinikkens fire faner (features/clinics/README.md 6.3).
describe("klinikkens faner", () => {
  it("har fire faner i rækkefølgen Henvendelser, Kalender, Anmeldelser, Klinikprofil", () => {
    expect(AREA_NAV.clinic.map((item) => item.label)).toEqual(["Henvendelser", "Kalender", "Anmeldelser", "Klinikprofil"]);
  });

  it("markerer den længste matchende sti, også via matches", () => {
    const nav = AREA_NAV.clinic;
    expect(activeNavHref(nav, "/klinik")).toBe("/klinik");
    expect(activeNavHref(nav, "/klinik/lead/abc")).toBe("/klinik");
    expect(activeNavHref(nav, "/klinik/kalender")).toBe("/klinik/kalender");
    expect(activeNavHref(nav, "/klinik/profil")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinik/profil/forhaandsvisning")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinik/prisliste")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinik/aabningstider")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinik/tandlaeger")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinikker")).toBeUndefined();
  });
});
