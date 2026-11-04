import { describe, expect, it } from "vitest";
import { AREA_HOME, AREA_NAV, activeNavHref } from "@/lib/common/navigation/areas";

// Klinikkens fem faner (features/clinics/README.md 6.3) og adminområdets to (features/admin/README.md 6.4).
describe("områdernes faner", () => {
  it("har fem faner i rækkefølgen Henvendelser, Kalender, Anmeldelser, Statistik, Klinikprofil", () => {
    expect(AREA_NAV.clinic.map((item) => item.label)).toEqual(["Henvendelser", "Kalender", "Anmeldelser", "Statistik", "Klinikprofil"]);
  });

  it("giver admin Moderation og Klinikker, og /admin ligger under Moderation som startside", () => {
    expect(AREA_NAV.admin.map((item) => item.label)).toEqual(["Moderation", "Klinikker"]);
    expect(AREA_HOME.admin).toBe("/admin/moderation");
    expect(activeNavHref(AREA_NAV.admin, "/admin/klinikker")).toBe("/admin/klinikker");
    expect(activeNavHref(AREA_NAV.admin, "/admin/moderation")).toBe("/admin/moderation");
  });

  it("markerer den længste matchende sti, også via matches", () => {
    const nav = AREA_NAV.clinic;
    expect(activeNavHref(nav, "/klinik")).toBe("/klinik");
    expect(activeNavHref(nav, "/klinik/lead/abc")).toBe("/klinik");
    expect(activeNavHref(nav, "/klinik/kalender")).toBe("/klinik/kalender");
    expect(activeNavHref(nav, "/klinik/statistik")).toBe("/klinik/statistik");
    expect(activeNavHref(nav, "/klinik/profil")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinik/profil/forhaandsvisning")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinik/prisliste")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinik/aabningstider")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinik/tandlaeger")).toBe("/klinik/profil");
    expect(activeNavHref(nav, "/klinikker")).toBeUndefined();
  });
});
