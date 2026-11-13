import { describe, expect, it } from "vitest";
import { danishHolidays, upcomingHolidays } from "@/lib/common/domain/holidays";

// Samme dage som public.danish_holidays() (migration 20261113000200, RLS-test 71).
describe("danishHolidays", () => {
  it("giver 2026's helligdage i datoorden", () => {
    expect(danishHolidays(2026).map((h) => h.date.slice(5))).toEqual([
      "01-01", "04-02", "04-03", "04-05", "04-06", "05-14", "05-24", "05-25", "06-05", "12-24", "12-25", "12-26", "12-31",
    ]);
  });

  it("beregner påsken rigtigt for flere år (og dermed de bevægelige helligdage)", () => {
    const easter = (year: number) => danishHolidays(year).find((h) => h.name === "Påskedag")?.date;
    expect(easter(2025)).toBe("2025-04-20");
    expect(easter(2027)).toBe("2027-03-28");
    expect(easter(2030)).toBe("2030-04-21");
    expect(danishHolidays(2027).find((h) => h.name === "Kristi himmelfartsdag")?.date).toBe("2027-05-06");
  });

  it("har ikke store bededag (afskaffet fra 2024)", () => {
    expect(danishHolidays(2026).some((h) => /bededag/i.test(h.name))).toBe(false);
  });
});

describe("upcomingHolidays", () => {
  it("starter fra og med i dag og fortsætter ind i næste år", () => {
    expect(upcomingHolidays("2026-12-24", 3).map((h) => h.date)).toEqual(["2026-12-24", "2026-12-25", "2026-12-26"]);
    expect(upcomingHolidays("2026-12-27", 2).map((h) => h.date)).toEqual(["2026-12-31", "2027-01-01"]);
  });
});
