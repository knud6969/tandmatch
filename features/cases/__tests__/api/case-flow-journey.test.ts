// Rejse-test (architecture 7.9a regel 7): hele sagen gennem API'et som appen (bearer, X-TandMatch-Client: mobile), med den falske
// AI-klient (AI_FAKE_CLIENT=1, sat af tests/api/run.sh). Trinnet beregnes med den rigtige nextCaseFlowStep() efter hvert kald.
// Intet kald til OpenAI. Kræver en kørende app og lokal Supabase: køres via `npm run test:api`.
import { after, describe, it } from "node:test";
import { register } from "node:module";
import assert from "node:assert/strict";
import {
  AI_CONSENT_VERSION,
  BASE_URL,
  PASSWORD,
  PRIVACY_VERSION,
  TERMS_VERSION,
  adminClient,
  uniqueEmail,
  type Res,
} from "../../../../tests/api/helpers.ts";

// node --test kender ikke "@/"-aliaset i lib/; en lille resolver gør det muligt at importere den rene funktion.
register("../../../../tests/api/alias-hooks.mjs", import.meta.url);
const { nextCaseFlowStep } = await import("../../../../lib/cases/domain/case-flow.ts");

const admin = adminClient();
const createdUserIds = new Set<string>();
after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

const SUGGESTION_FALLBACK_TEXT =
  "Ud fra det, du har fortalt, kan behandlingerne nedenfor være relevante. Du vælger selv, og klinikken laver den endelige vurdering.";

// Som appen: ingen cookies, unikt klient-IP, bearer og vilkårs-token.
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
  get(path: string) {
    return this.request("GET", path);
  }
  post(path: string, body: unknown = {}) {
    return this.request("POST", path, body);
  }
  put(path: string, body: unknown) {
    return this.request("PUT", path, body);
  }
  patch(path: string, body: unknown) {
    return this.request("PATCH", path, body);
  }

  async start(): Promise<void> {
    const terms = await this.post("/api/terms/accept", { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
    assert.equal(terms.status, 200);
    this.termsToken = terms.body.termsToken;
    const created = await this.post("/api/session/anonymous", { aiConsent: { textVersion: AI_CONSENT_VERSION } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    this.accessToken = created.body.session.accessToken;
    this.caseId = created.body.caseId;
    const me = await this.get("/api/me");
    createdUserIds.add(me.body.id);
  }

  say(message: string) {
    return this.post(`/api/cases/${this.caseId}/chat`, { message });
  }

  // Trinnet, som appen beregner det efter et kald (samme funktion som i appen).
  async step(): Promise<string> {
    const [caseRes, chatRes] = await Promise.all([this.get(`/api/cases/${this.caseId}`), this.get(`/api/cases/${this.caseId}/chat`)]);
    assert.equal(caseRes.status, 200);
    assert.equal(chatRes.status, 200);
    return nextCaseFlowStep(caseRes.body, chatRes.body);
  }
}

function r() {
  return 1 + Math.floor(Math.random() * 250);
}

async function undersoegelseId(app: App): Promise<string> {
  const svc = await app.get("/api/services");
  const all = svc.body.groups.flatMap((g: { services: { id: string; slug: string }[] }) => g.services);
  return all.find((s: { slug: string }) => s.slug === "undersoegelse").id;
}

describe("rejsen gennem sagen (7.9a)", () => {
  it("almindelig samtale -> forslag -> kort -> tidsrum -> postnummer -> opsummering -> konto -> canSend -> klinikoversigten", async () => {
    const app = new App();
    await app.start();
    assert.equal(await app.step(), "chat");

    // Tre almindelige beskeder uden nøgleord: to spørgsmål med hurtigsvar, så forslaget.
    const first = await app.say("Jeg har ondt i en tand");
    assert.equal(first.status, 201);
    assert.ok(first.body.assistantMessage.quickReplies.length >= 2 && first.body.assistantMessage.quickReplies.length <= 4);
    assert.equal(first.body.readyForSummary, false);
    assert.equal(await app.step(), "chat");

    const second = await app.say("Det sidder bagtil");
    assert.ok(second.body.assistantMessage.quickReplies.length >= 2);
    assert.equal(await app.step(), "chat");

    const third = await app.say("Det er et par uger siden");
    assert.equal(third.body.assistantMessage.suggestedServices[0].slug, "undersoegelse");
    assert.equal(third.body.readyForSummary, true);
    assert.equal(await app.step(), "services");

    // En besked mere: kortet bliver stående.
    assert.equal((await app.say("Tak")).status, 201);
    assert.equal(await app.step(), "services");

    const serviceId = await undersoegelseId(app);
    assert.equal((await app.put(`/api/cases/${app.caseId}/services`, { services: [{ serviceId, suggestedByAi: true }] })).status, 200);
    assert.equal(await app.step(), "timeframe");
    assert.equal((await app.patch(`/api/cases/${app.caseId}`, { preferredTimeframe: "within_2_weeks" })).status, 200);
    assert.equal(await app.step(), "postal_code");
    assert.equal((await app.patch(`/api/cases/${app.caseId}`, { postalCode: "2100" })).status, 200);
    assert.equal(await app.step(), "summary");

    const summary = await app.post(`/api/cases/${app.caseId}/summary`, {});
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.equal(await app.step(), "summary", "kun et udkast, ikke godkendt endnu");
    const approved = await app.put(`/api/cases/${app.caseId}/summary`, { summaryText: "Jeg har haft ondt i en tand bagtil i et par uger og vil have den undersøgt." });
    assert.equal(approved.status, 200);
    assert.equal(await app.step(), "ready");

    // Konto, så sagen kan sendes.
    const conv = await app.post("/api/auth/convert", { email: uniqueEmail("rejse"), password: PASSWORD, firstName: "Rejse" });
    assert.equal(conv.status, 200, JSON.stringify(conv.body));
    app.accessToken = conv.body.session.accessToken;
    const sag = await app.get(`/api/cases/${app.caseId}`);
    assert.equal(sag.body.canSend, true);
    assert.equal(await app.step(), "ready");

    // "Se klinikker der kan hjælpe": kun klinikker med pris på sagens behandlinger (10.7).
    const slugs = sag.body.services.map((s: { slug: string }) => s.slug).join(",");
    assert.equal(slugs, "undersoegelse");
    const clinics = await app.get(`/api/clinics?services=${slugs}&onlyOffering=true`);
    assert.equal(clinics.status, 200, JSON.stringify(clinics.body));
    assert.ok(Array.isArray(clinics.body.clinics));
    assert.ok(clinics.body.clinics.every((c: { priceForSelection: unknown }) => c.priceForSelection !== null));
  });

  it("seks beskeder uden forslag giver kortet uden forslag (efter fem er der stadig chat)", async () => {
    const app = new App();
    await app.start();
    // "test_suggest_not_ready" ville give forslag; her bruges et filter-ramt svar (pris), så der ikke kommer forslag.
    for (let i = 1; i <= 6; i++) {
      const res = await app.say(`test_price besked ${i}`);
      assert.equal(res.status, 201);
      assert.equal(res.body.assistantMessage.suggestedServices.length, 0);
      assert.equal(await app.step(), i < 6 ? "chat" : "services", `efter besked ${i}`);
    }
    const sag = await app.get(`/api/cases/${app.caseId}`);
    assert.deepEqual(sag.body.suggestedServices, []);
  });

  it("test_suggest_not_ready giver forslag uden flag og alligevel kortet", async () => {
    const app = new App();
    await app.start();
    const res = await app.say("test_suggest_not_ready");
    assert.equal(res.body.assistantMessage.suggestedServices[0].slug, "undersoegelse");
    assert.equal(res.body.readyForSummary, false);
    assert.equal(await app.step(), "services");
  });

  it("test_blocked_suggestion giver den faste tekst med forslaget og kortet", async () => {
    const app = new App();
    await app.start();
    const res = await app.say("test_blocked_suggestion");
    assert.equal(res.body.assistantMessage.blocked, true);
    assert.equal(res.body.assistantMessage.content, SUGGESTION_FALLBACK_TEXT);
    assert.equal(res.body.assistantMessage.suggestedServices[0].slug, "undersoegelse");
    assert.equal(res.body.readyForSummary, true);
    assert.equal(await app.step(), "services");
  });
});
