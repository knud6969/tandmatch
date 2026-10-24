// API-tests for overdragelse af en anonym kladde til en eksisterende konto (architecture 7.7, 10.2):
// POST /api/session/claim-token (anonym) og POST /api/session/claim (patient med konto). Appen bruger bearer-tokens.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_CONSENT_VERSION,
  BASE_URL,
  PASSWORD,
  PRIVACY_VERSION,
  TERMS_VERSION,
  TestClient,
  adminClient,
  newClientWithTerms,
  randomCvr,
  uniqueEmail,
  type Res,
} from "../../../../tests/api/helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

// Som appen: ingen cookies, unikt klient-IP, bearer og vilkårs-token.
class AppClient {
  readonly ip = `10.${r()}.${r()}.${r()}`;
  accessToken: string | null = null;
  termsToken: string | null = null;
  userId = "";
  caseId = "";

  async request(method: string, path: string, body?: unknown): Promise<Res> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, "X-TandMatch-Client": "mobile" };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (this.termsToken) headers["X-Terms-Token"] = this.termsToken;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(BASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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

  async terms(): Promise<this> {
    const res = await this.post("/api/terms/accept", { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
    assert.equal(res.status, 200);
    this.termsToken = res.body.termsToken;
    return this;
  }

  // Anonym session med en kladde, der har indhold: en ydelse og et postnummer (chatten dækkes af RLS-testen 52).
  async startAnonymousWithDraft(): Promise<this> {
    await this.terms();
    const created = await this.post("/api/session/anonymous", { aiConsent: { textVersion: AI_CONSENT_VERSION } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    this.accessToken = created.body.session.accessToken;
    this.caseId = created.body.caseId;
    this.userId = (await this.get("/api/me")).body.id;
    createdUserIds.add(this.userId);
    const svc = await this.get("/api/services");
    const all = svc.body.groups.flatMap((g: { services: { id: string; slug: string }[] }) => g.services);
    const serviceId = all.find((s: { slug: string }) => s.slug === "undersoegelse").id;
    assert.equal((await this.put(`/api/cases/${this.caseId}/services`, { services: [{ serviceId, suggestedByAi: true }] })).status, 200);
    assert.equal((await this.patch(`/api/cases/${this.caseId}`, { postalCode: "2100" })).status, 200);
    return this;
  }

  async signupPatient(): Promise<this> {
    await this.terms();
    const res = await this.post("/api/auth/signup", { role: "patient", email: uniqueEmail("claim"), password: PASSWORD, firstName: "Mia" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    createdUserIds.add(res.body.userId);
    this.userId = res.body.userId;
    this.accessToken = res.body.session.accessToken;
    return this;
  }

  async issueToken(): Promise<string> {
    const res = await this.post("/api/session/claim-token");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.headers.get("cache-control"), "no-store");
    return res.body.claimToken;
  }
}

function r() {
  return 1 + Math.floor(Math.random() * 250);
}

describe("overdragelse af anonym kladde til eksisterende konto", () => {
  it("hele vejen: token fra anonym, login, claim; sagen, chatten og ydelserne følger med; den anonyme er væk", async () => {
    const anon = await new AppClient().startAnonymousWithDraft();
    const claimToken = await anon.issueToken();
    assert.equal(claimToken.length, 64);

    const patient = await new AppClient().signupPatient();
    const own = await patient.post("/api/cases");
    assert.equal(own.status, 201);

    const claimed = await patient.post("/api/session/claim", { claimToken });
    assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
    assert.equal(claimed.headers.get("cache-control"), "no-store");
    assert.deepEqual(claimed.body, { caseId: anon.caseId, moved: true });

    const list = await patient.get("/api/cases");
    const ids = list.body.cases.map((c: { id: string }) => c.id);
    assert.ok(ids.includes(anon.caseId) && ids.includes(own.body.id ?? own.body.caseId), "både den egen og den overtagne sag");
    const caseRes = await patient.get(`/api/cases/${anon.caseId}`);
    assert.equal(caseRes.status, 200);
    assert.equal(caseRes.body.postalCode, "2100");
    assert.equal(caseRes.body.services.length, 1);
    assert.equal((await patient.get(`/api/cases/${anon.caseId}/chat`)).status, 200);
    const consents = await patient.get("/api/consents");
    assert.ok(consents.body.consents.some((c: { type: string; grantedWhileAnonymous: boolean }) => c.type === "ai_processing" && c.grantedWhileAnonymous));

    // Den anonyme bruger er slettet: tokenet virker ikke mere.
    assert.equal((await anon.get("/api/me")).status, 401);
    const { data } = await admin.auth.admin.getUserById(anon.userId);
    assert.equal(data.user, null);

    // Dobbelt claim af samme patient: samme svar, ingen ændring.
    const again = await patient.post("/api/session/claim", { claimToken });
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, { caseId: anon.caseId, moved: true });
    assert.equal((again.body as Record<string, unknown>).anonId, undefined);

    // En anden patient kan ikke genbruge tokenet.
    const other = await new AppClient().signupPatient();
    const stolen = await other.post("/api/session/claim", { claimToken });
    assert.equal(stolen.status, 400);
    assert.equal(stolen.body.error.code, "CLAIM_INVALID");
    assert.equal((await other.get(`/api/cases/${anon.caseId}`)).status, 404);
  });

  it("angreb: claim med ikke-anonymt token, anonym, klinik, gættet id, uden login og ugyldigt input", async () => {
    const victim = await new AppClient().startAnonymousWithDraft();
    const victimToken = await victim.issueToken();
    const patient = await new AppClient().signupPatient();

    // En permanent konto kan ikke udstede et token.
    const issue = await patient.post("/api/session/claim-token");
    assert.equal(issue.status, 403);
    assert.equal(issue.body.error.code, "NOT_ANONYMOUS");

    // Sagens id, brugerens id og det anonyme adgangstoken er ikke claim-tokens.
    for (const bad of [victim.caseId.replace(/-/g, "") + victim.caseId.replace(/-/g, ""), victim.userId.repeat(2), "x".repeat(64)]) {
      const res = await patient.post("/api/session/claim", { claimToken: bad });
      assert.equal(res.status, 400, bad);
      assert.equal(res.body.error.code, "CLAIM_INVALID");
    }
    const jwt = await patient.post("/api/session/claim", { claimToken: victim.accessToken });
    assert.equal(jwt.status, 400); // for langt til at være et claim-token (VALIDATION_ERROR)
    assert.equal((await patient.post("/api/session/claim", {})).status, 400);
    assert.equal((await patient.post("/api/session/claim", { claimToken: victimToken, extra: 1 })).status, 400);
    assert.equal((await patient.get(`/api/cases/${victim.caseId}`)).status, 404);

    // En anden anonym bruger kan ikke indløse.
    const anon2 = await new AppClient().startAnonymousWithDraft();
    const asAnon = await anon2.post("/api/session/claim", { claimToken: victimToken });
    assert.equal(asAnon.status, 403);
    assert.equal(asAnon.body.error.code, "ANONYMOUS_NOT_ALLOWED");

    // Uden login.
    const noLogin = await new AppClient().terms();
    assert.equal((await noLogin.post("/api/session/claim", { claimToken: victimToken })).status, 401);
    assert.equal((await noLogin.post("/api/session/claim-token")).status, 401);

    // Klinik.
    const clinic: TestClient = await newClientWithTerms();
    const signup = await clinic.post("/api/auth/signup", {
      role: "clinic",
      email: uniqueEmail("klinik"),
      password: PASSWORD,
      cvr: randomCvr(),
      clinicName: "Claimtestklinikken",
      address: "Testvej 1",
      postalCode: "2100",
      city: "København Ø",
      phone: "00 00 00 01",
    });
    assert.equal(signup.status, 201, JSON.stringify(signup.body));
    createdUserIds.add(signup.body.userId);
    const asClinic = await clinic.post("/api/session/claim", { claimToken: victimToken });
    assert.equal(asClinic.status, 403);
    assert.equal(asClinic.body.error.code, "FORBIDDEN");
    assert.equal((await clinic.post("/api/session/claim-token")).status, 403);

    // Offerets kladde ligger uændret hos offeret, og tokenet kan stadig bruges af en rigtig patient.
    assert.equal((await victim.get(`/api/cases/${victim.caseId}`)).status, 200);
    const ok = await patient.post("/api/session/claim", { claimToken: victimToken });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.moved, true);
  });

  it("en tom kladde flyttes ikke, og IP-rate limit gælder (10 pr. time)", async () => {
    const anon = await new AppClient().terms();
    const created = await anon.post("/api/session/anonymous", { aiConsent: { textVersion: AI_CONSENT_VERSION } });
    anon.accessToken = created.body.session.accessToken;
    anon.userId = (await anon.get("/api/me")).body.id;
    createdUserIds.add(anon.userId);
    const token = await anon.issueToken();

    const patient = await new AppClient().signupPatient();
    const res = await patient.post("/api/session/claim", { claimToken: token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { caseId: null, moved: false });

    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await patient.post("/api/session/claim", { claimToken: "y".repeat(64) })).status;
      if (last === 429) break;
    }
    assert.equal(last, 429);
  });
});
