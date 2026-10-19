// API-test for 7.15: postnumre fra GeoNames. Alle danske postnumre, fx 2730 (Herlev), skal kunne bruges som udgangspunkt.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newClientWithTerms } from "./helpers.ts";

describe("GET /api/clinics med postnummer fra GeoNames", () => {
  it("giver 200 for 2730 (Herlev), 3790, 6000 og 9990", async () => {
    const c = await newClientWithTerms();
    for (const code of ["2730", "3790", "6000", "9990"]) {
      const r = await c.get(`/api/clinics?postalCode=${code}`);
      assert.equal(r.status, 200, code);
    }
  });
});
