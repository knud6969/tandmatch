import { describe, expect, it } from "vitest";
import { toClinicMonth } from "@/lib/common/domain/time";

describe("toClinicMonth", () => {
  it("giver november for 1. november 00.30 dansk tid (oktober i UTC)", () => {
    expect(toClinicMonth("2026-10-31T23:30:00Z")).toBe("2026-11");
  });
  it("giver oktober lige før månedsskiftet", () => {
    expect(toClinicMonth("2026-10-31T22:59:59Z")).toBe("2026-10");
  });
  it("håndterer årsskifte og sommertid", () => {
    expect(toClinicMonth("2026-12-31T23:30:00Z")).toBe("2027-01");
    expect(toClinicMonth("2026-05-31T22:30:00Z")).toBe("2026-06");
  });
});
