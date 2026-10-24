// Acceptkriterier for demodata (arbejdsplan 7.9): kører kun, når `npm run seed:demo` er kørt (ellers springes over).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMERGENCY_FILTER_HOURS } from "../../../../lib/clinics/constants/clinics.ts";
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
    // Kun demoklinikkerne: andre tests kan have efterladt egne verificerede klinikker i databasen.
    return (r.body.clinics as Listed[]).filter((x) => x.name.startsWith("Demo ")).map((x) => x.name.replace("Demo ", "").replace(/^Tandklinik |^Tandcenter |^Tandlægerne /, ""));
  }
  const sorted = (names: string[]) => [...names].sort();

  it("onlyOffering fra 2100: specialbehandlinger findes hos mindst to klinikker", async () => {
    assert.deepEqual(sorted(await offering("fast_bojle")), ["Hellerup", "Nørrebro"]);
    assert.deepEqual(sorted(await offering("implantat")), ["Amager", "Østerbro"]);
    assert.deepEqual(sorted(await offering("boerneundersoegelse")), ["Vesterbro", "Østerbro"]);
  });

  it("onlyOffering fra 2100: typiske AI-kombinationer giver mindst to klinikker", async () => {
    const combos = [
      "undersoegelse,roentgen", "undersoegelse,fyldning,roentgen", "tandregulering_konsultation,tandreguleringsskinner",
      "bro,implantat", "tandkoedsundersoegelse,dybderensning", "tandrensning,blegning", "tandrensning,blegning,fyldning",
      "rodbehandling,krone", "boerneundersoegelse", "blegning,facing",
    ];
    for (const combo of combos) assert.ok((await offering(combo)).length >= 2, `${combo}: for få klinikker`);
    assert.deepEqual(sorted(await offering("tandreguleringsskinner")), ["Hellerup", "Nørrebro"]);
  });

  it("onlyOffering fra 2100: undersøgelse giver alle fem verificerede; akut_konsultation med akutfilter giver Østerbro og Nørrebro", async () => {
    assert.deepEqual(sorted(await offering("undersoegelse")), ["Amager", "Hellerup", "Nørrebro", "Vesterbro", "Østerbro"]);
    // Østerbro har akuttider hver dag 07-22, så den er altid med. Nørrebros akutvindue er kun hverdage 16-19 (seed-demo.ts), så den er
    // kun med, når dens første akuttid ligger inden for akutfilterets vindue (EMERGENCY_FILTER_HOURS); i weekender kan den ligge senere.
    const c = await newClientWithTerms();
    const all = await c.get("/api/clinics?postalCode=2100&services=akut_konsultation&onlyOffering=true");
    assert.equal(all.status, 200, JSON.stringify(all.body));
    const nbro = (all.body.clinics as (Listed & { firstEmergencyAt: string | null })[]).find((x) => x.name.includes("Nørrebro"));
    const first = nbro?.firstEmergencyAt ? new Date(nbro.firstEmergencyAt).getTime() : null;
    const inWindow = first !== null && first <= Date.now() + EMERGENCY_FILTER_HOURS * 60 * 60 * 1000;
    assert.deepEqual(sorted(await offering("akut_konsultation", "&emergency=true")), inWindow ? ["Nørrebro", "Østerbro"] : ["Østerbro"]);
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
