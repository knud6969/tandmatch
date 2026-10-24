// Vejen chat -> bekræftede behandlinger -> tid og postnummer -> klinikoversigtens forespørgsel, som appen gør den
// (bearer, X-Terms-Token, X-TandMatch-Client: mobile; anonym session). Falsk AI-klient (AI_FAKE_CLIENT=1) med realistiske
// forslag pr. scenarie (FAKE_SCENARIOS i features/cases/ai/fakeAiClient.ts). Forespørgslen bygges af appens egen kode
// (mobile/src/utils/clinic-filters.ts) med samme felter som mobile/src/screens/clinic-directory-screen.tsx sætter i sags-tilstand.
// Kræver demodata (`npm run seed:demo`) i den lokale database. Køres via `npm run test:api`.
import { after, describe, it } from "node:test";
import { register } from "node:module";
import assert from "node:assert/strict";
import { AI_CONSENT_VERSION, BASE_URL, PRIVACY_VERSION, TERMS_VERSION, adminClient, type Res } from "../../../../tests/api/helpers.ts";

register("../../../../tests/api/alias-hooks.mjs", import.meta.url);
const { DEFAULT_FILTERS, buildClinicsQuery } = await import("../../../../mobile/src/utils/clinic-filters.ts");
type Filters = typeof DEFAULT_FILTERS;

const admin = adminClient();
const createdUserIds = new Set<string>();
after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

const r = () => 1 + Math.floor(Math.random() * 250);

class App {
  readonly ip = `10.${r()}.${r()}.${r()}`;
  accessToken: string | null = null;
  termsToken: string | null = null;
  caseId = "";

  async request(method: string, path: string, body?: unknown): Promise<Res> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, "X-TandMatch-Client": "mobile" };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (this.termsToken) headers["X-Terms-Token"] = this.termsToken;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(BASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  async start() {
    const terms = await this.request("POST", "/api/terms/accept", { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
    assert.equal(terms.status, 200);
    this.termsToken = terms.body.termsToken;
    const created = await this.request("POST", "/api/session/anonymous", { aiConsent: { textVersion: AI_CONSENT_VERSION } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    this.accessToken = created.body.session.accessToken;
    this.caseId = created.body.caseId;
    createdUserIds.add((await this.request("GET", "/api/me")).body.id);
  }
}

// Præcis det skærmen sætter, når sagen er hentet (clinic-directory-screen.tsx, useEffect på caseId).
function caseFilters(dto: { services: { slug: string }[]; postalCode: string | null }): Filters {
  return {
    ...DEFAULT_FILTERS,
    serviceSlugs: dto.services.map((s) => s.slug),
    onlyOffering: true,
    postalCode: dto.postalCode ?? DEFAULT_FILTERS.postalCode,
    position: dto.postalCode ? null : DEFAULT_FILTERS.position,
  };
}

const SCENARIOS: { key: string; message: string; expected: string[] }[] = [
  { key: "tandpine_koldt", message: "Jeg har ondt i en tand, når jeg drikker noget koldt", expected: ["undersoegelse", "fyldning"] },
  { key: "skaeve_taender", message: "Mine tænder er skæve, og jeg vil gerne have usynlig regulering", expected: ["tandregulering_konsultation", "tandreguleringsskinner"] },
  { key: "bloedende_tandkoed", message: "Mit tandkød bløder, når jeg børster", expected: ["tandkoedsundersoegelse", "tandrensning"] },
  { key: "manglende_tand", message: "Jeg mangler en tand", expected: ["implantat_samtale", "bro"] },
  { key: "blegning", message: "Jeg vil gerne have hvidere tænder", expected: ["blegning"] },
  { key: "tjek_og_rens", message: "Jeg vil have et tjek og en rens", expected: ["undersoegelse", "tandrensning"] },
  { key: "barn", message: "Mit barn skal til tandlæge første gang", expected: ["boerneundersoegelse", "tilvaenning_tandlaege"] },
  { key: "knaekket_tand", message: "Jeg har knækket en tand", expected: ["reparation_knaekket_tand"] },
];

describe("chat -> klinikoversigt som appen (sags-tilstand)", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.key}: forslag -> bekræft -> tid og postnummer 2100 -> mindst 2 klinikker med pris, alle kan modtage leads`, async () => {
      const app = new App();
      await app.start();

      const turn = await app.request("POST", `/api/cases/${app.caseId}/chat`, { message: `${sc.message} test_scenario_${sc.key}` });
      assert.equal(turn.status, 201, JSON.stringify(turn.body));
      assert.deepEqual(turn.body.assistantMessage.suggestedServices.map((s: { slug: string }) => s.slug).sort(), [...sc.expected].sort());

      // services-card: forslagene er valgt fra start, og kortet sender suggestedIds fra sagen (caseDto.suggestedServices).
      const before = (await app.request("GET", `/api/cases/${app.caseId}`)).body;
      assert.deepEqual(before.suggestedServices.map((s: { slug: string }) => s.slug).sort(), [...sc.expected].sort());
      const ids: string[] = before.suggestedServices.map((s: { id: string }) => s.id);
      const put = await app.request("PUT", `/api/cases/${app.caseId}/services`, { services: ids.map((serviceId) => ({ serviceId, suggestedByAi: true })) });
      assert.equal(put.status, 200, JSON.stringify(put.body));

      // Tidskortet og postnummerkortet.
      assert.equal((await app.request("PATCH", `/api/cases/${app.caseId}`, { preferredTimeframe: "within_2_weeks" })).status, 200);
      assert.equal((await app.request("PATCH", `/api/cases/${app.caseId}`, { postalCode: "2100" })).status, 200);

      const dto = (await app.request("GET", `/api/cases/${app.caseId}`)).body;
      assert.equal(dto.postalCode, "2100", "sagens postnummer gemmes");
      assert.deepEqual(dto.services.map((s: { slug: string }) => s.slug).sort(), [...sc.expected].sort(), "sagen indeholder kun det, patienten valgte");

      const filters = caseFilters(dto);
      const query = buildClinicsQuery(filters);
      const params = new URLSearchParams(query);
      assert.equal(params.get("emergency"), null);
      assert.equal(params.get("lat"), null);
      assert.equal(params.get("postalCode"), "2100");
      assert.equal(params.get("maxDistanceKm"), "50");
      assert.equal(params.get("onlyOffering"), "true");
      assert.equal(params.get("sort"), null);

      const list = await app.request("GET", `/api/clinics?${query}`);
      assert.equal(list.status, 200, JSON.stringify(list.body));
      const clinics = list.body.clinics as { name: string; canReceiveLeads: boolean; priceForSelection: unknown }[];
      assert.ok(clinics.length >= 2, `${sc.key}: ${clinics.length} klinikker (forespørgsel: ${query})`);
      assert.ok(clinics.every((c) => c.canReceiveLeads), "kun verificerede klinikker");
      assert.ok(clinics.every((c) => c.priceForSelection !== null), "alle har pris på alle valgte behandlinger");
      console.log(`  ${sc.key}: ${sc.expected.join(", ")} -> ${clinics.length} klinikker`);
    });
  }

  it("postnummer langt væk (9000) giver ingen København-klinikker (dokumenterer adfærden: 50 km, kun klinikker med pris; kun den verificerede Aalborg-klinik)", async () => {
    const app = new App();
    await app.start();
    const turn = await app.request("POST", `/api/cases/${app.caseId}/chat`, { message: "test_scenario_blegning" });
    assert.equal(turn.status, 201);
    const ids: string[] = (await app.request("GET", `/api/cases/${app.caseId}`)).body.suggestedServices.map((s: { id: string }) => s.id);
    assert.equal((await app.request("PUT", `/api/cases/${app.caseId}/services`, { services: ids.map((serviceId) => ({ serviceId, suggestedByAi: true })) })).status, 200);
    assert.equal((await app.request("PATCH", `/api/cases/${app.caseId}`, { postalCode: "9000" })).status, 200);
    const dto = (await app.request("GET", `/api/cases/${app.caseId}`)).body;
    const list = await app.request("GET", `/api/clinics?${buildClinicsQuery(caseFilters(dto))}`);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    // Demodata har én verificeret klinik i Aalborg (v3); ingen af København-klinikkerne ligger inden for 50 km.
    const names: string[] = list.body.clinics.map((c: { name: string }) => c.name);
    assert.ok(names.length <= 1, `forventede højst Aalborg-klinikken, fik ${names.join(", ")}`);
    assert.ok(names.every((n) => n.includes("Aalborg")), names.join(", "));
  });
});
