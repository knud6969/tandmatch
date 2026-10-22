// Acceptkriterier for demodata (arbejdsplan 7.9): kører kun, når `npm run seed:demo` er kørt (ellers springes over).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adminClient, newClientWithTerms } from "../../../../tests/api/helpers.ts";

type Listed = { name: string; tier: string; canReceiveLeads: boolean; reviewStats: { priceAccuracyPct: number | null } | null };

const { count } = await adminClient().from("clinics").select("id", { count: "exact", head: true }).eq("import_source", "seed");
const hasDemo = (count ?? 0) > 0;

describe("demodata fra seed:demo", { skip: !hasDemo && "demodata er ikke seedet" }, () => {
  it("2100 viser mindst 5 verificerede klinikker, heraf mindst 3 med prisnøjagtighed", async () => {
    const c = await newClientWithTerms();
    const r = await c.get("/api/clinics?postalCode=2100");
    assert.equal(r.status, 200);
    const demo = (r.body.clinics as Listed[]).filter((x) => x.name.startsWith("Demo "));
    const verified = demo.filter((x) => x.canReceiveLeads);
    assert.ok(verified.length >= 5, `verificerede: ${verified.length}`);
    assert.ok(verified.filter((x) => typeof x.reviewStats?.priceAccuracyPct === "number").length >= 3);
  });

  it("akutfilteret fra 2100 er ikke tomt", async () => {
    const c = await newClientWithTerms();
    const r = await c.get("/api/clinics?postalCode=2100&emergency=true");
    assert.equal(r.status, 200);
    assert.ok((r.body.clinics as unknown[]).length > 0);
  });
});
