import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/navigation/paths";

describe("safeInternalPath", () => {
  it("accepterer interne stier", () => {
    expect(safeInternalPath("/klinik/profil")).toBe("/klinik/profil");
  });

  it("afviser eksterne og farlige stier", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "/api/x", "/vilkaar/accepter", "", undefined]) {
      expect(safeInternalPath(bad)).toBeNull();
    }
  });
});
