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

  // Søgningerne i mobile/README.md 13.8: onlyOffering fra 2100 (trin 9.8 og 9.11).
  async function offering(services: string, extra = ""): Promise<string[]> {
    const c = await newClientWithTerms();
    const r = await c.get(`/api/clinics?postalCode=2100&services=${services}&onlyOffering=true${extra}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return (r.body.clinics as Listed[]).map((x) => x.name.replace("Demo ", "").replace(/^Tandklinik |^Tandcenter |^Tandlægerne /, ""));
  }
  const sorted = (names: string[]) => [...names].sort();

  it("onlyOffering fra 2100: fast_bojle giver kun Nørrebro; implantat kun Amager; børneundersøgelse kun Vesterbro", async () => {
    assert.deepEqual(await offering("fast_bojle"), ["Nørrebro"]);
    assert.deepEqual(await offering("implantat"), ["Amager"]);
    assert.deepEqual(await offering("boerneundersoegelse"), ["Vesterbro"]);
  });

  it("onlyOffering fra 2100: skinner giver Nørrebro og Hellerup; blegning + facing giver Nørrebro og Hellerup", async () => {
    assert.deepEqual(sorted(await offering("tandreguleringsskinner")), ["Hellerup", "Nørrebro"]);
    assert.deepEqual(sorted(await offering("blegning,facing")), ["Hellerup", "Nørrebro"]);
  });

  it("onlyOffering fra 2100: undersøgelse giver alle fem verificerede (ingen basisklinikker); akut_konsultation med akutfilter giver Østerbro og Nørrebro", async () => {
    assert.deepEqual(sorted(await offering("undersoegelse")), ["Amager", "Hellerup", "Nørrebro", "Vesterbro", "Østerbro"]);
    assert.deepEqual(sorted(await offering("akut_konsultation", "&emergency=true")), ["Nørrebro", "Østerbro"]);
  });

  it("onlyOffering uden behandlinger giver 400", async () => {
    const c = await newClientWithTerms();
    assert.equal((await c.get("/api/clinics?postalCode=2100&onlyOffering=true")).status, 400);
  });

  it("hvert seedet lead går til en klinik med pris på alle sagens behandlinger", async () => {
    const admin = adminClient();
    const demoClinics = await admin.from("clinics").select("id").eq("import_source", "seed").eq("status", "verified");
    const demoIds = (demoClinics.data ?? []).map((c) => c.id as string);
    const leads = await admin.from("leads").select("case_id, clinic_id").in("clinic_id", demoIds);
    assert.ifError(leads.error);
    assert.ok((leads.data ?? []).length > 0);
    for (const lead of leads.data ?? []) {
      const wanted = await admin.from("case_services").select("service_id").eq("case_id", lead.case_id);
      const priced = await admin.from("clinic_prices").select("service_id").eq("clinic_id", lead.clinic_id);
      const have = new Set((priced.data ?? []).map((r) => r.service_id as string));
      for (const row of wanted.data ?? []) assert.ok(have.has(row.service_id as string), `lead til klinik uden pris (sag ${lead.case_id})`);
    }
  });
});
