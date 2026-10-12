// API-tests for trin 0-kernen (architecture 2.3.1, 2.5, 10.1-10.3). Kører mod en rigtig app + lokal Supabase.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_CONSENT_VERSION,
  BASE_URL,
  IMAGE_CONSENT_VERSION,
  PASSWORD,
  SHARING_CONSENT_VERSION,
  TestClient,
  adminClient,
  forgeTermsCookie,
  newClientWithTerms,
  uniqueEmail,
} from "./helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

async function userExists(id: string): Promise<boolean> {
  const { data } = await admin.auth.admin.getUserById(id);
  return Boolean(data?.user);
}

async function anonymousWithCase() {
  const c = await newClientWithTerms();
  const r = await c.startAnonymous();
  assert.equal(r.status, 201);
  const me = await c.get("/api/me");
  createdUserIds.add(me.body.id);
  return { c, caseId: r.body.caseId as string, userId: me.body.id as string };
}

describe("vilkårs-gate", () => {
  it("giver 403 TERMS_REQUIRED uden accept", async () => {
    const c = new TestClient();
    for (const path of ["/api/me", "/api/consents", "/api/patients/me"]) {
      const r = await c.get(path);
      assert.equal(r.status, 403, path);
      assert.equal(r.body.error.code, "TERMS_REQUIRED", path);
    }
    const anon = await c.startAnonymous();
    assert.equal(anon.status, 403);
    assert.equal(anon.body.error.code, "TERMS_REQUIRED");
  });

  it("afviser forfalsket cookie (forkert hemmelighed) og skrald", async () => {
    for (const value of [forgeTermsCookie("en-helt-anden-hemmelighed-der-er-lang-nok-123"), "skrald", "a.b", ""]) {
      const c = new TestClient();
      c.cookies.set("tm_terms", value);
      const r = await c.startAnonymous();
      assert.equal(r.status, 403, value);
      assert.equal(r.body.error.code, "TERMS_REQUIRED");
    }
  });

  it("afviser forældede versioner", async () => {
    const c = new TestClient();
    const r = await c.post("/api/terms/accept", { termsVersion: "gammel", privacyVersion: "gammel" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "OUTDATED_TERMS");
    assert.equal(c.cookies.has("tm_terms"), false);
  });

  it("accept sætter cookie, og status/API virker bagefter", async () => {
    const c = new TestClient();
    const before = await c.get("/api/terms/status");
    assert.equal(before.status, 200);
    assert.equal(before.body.accepted, false);
    const r = await c.acceptTerms();
    assert.equal(r.status, 200);
    assert.ok(c.cookies.has("tm_terms"));
    const after = await c.get("/api/terms/status");
    assert.equal(after.body.accepted, true);
    const consents = await c.get("/api/consents");
    assert.notEqual(consents.status, 403);
  });

  it("logout kræver ikke vilkårs-accept", async () => {
    const r = await new TestClient().post("/api/auth/logout");
    assert.equal(r.status, 204);
  });

  it("sider (ikke API) redirecter til /vilkaar/accepter uden accept; /vilkaar er åben", async () => {
    const c = new TestClient();
    const r = await c.get("/start");
    assert.equal(r.status, 307);
    assert.match(r.headers.get("location") ?? "", /\/vilkaar\/accepter\?naeste=/);
  });
});

describe("anonym session", () => {
  it("201 med caseId, retry giver 200 og samme caseId", async () => {
    const { c, caseId } = await anonymousWithCase();
    assert.match(caseId, /^[0-9a-f-]{36}$/);
    const retry = await c.startAnonymous();
    assert.equal(retry.status, 200);
    assert.equal(retry.body.caseId, caseId);
    assert.ok(retry.body.expiresAt);
  });

  it("/api/me viser anonym patient", async () => {
    const { c } = await anonymousWithCase();
    const me = await c.get("/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.role, "patient");
    assert.equal(me.body.isAnonymous, true);
    assert.ok(me.body.anonymousExpiresAt);
  });

  it("afviser forkert samtykketekst-version og ukendte felter", async () => {
    const c = await newClientWithTerms();
    const r = await c.post("/api/session/anonymous", { aiConsent: { textVersion: "forkert" } });
    assert.equal(r.status, 400);
    const r2 = await c.post("/api/session/anonymous", { aiConsent: { textVersion: AI_CONSENT_VERSION }, extra: 1 });
    assert.equal(r2.status, 400);
  });

  it("giver ai_processing-samtykke ved start, men intet billede- eller delingssamtykke", async () => {
    const { c } = await anonymousWithCase();
    const list = await c.get("/api/consents");
    const active = list.body.consents.filter((x: { id: string; type: string; withdrawnAt: string | null }) => !x.withdrawnAt);
    assert.deepEqual(active.map((x: { id: string; type: string; withdrawnAt: string | null }) => x.type), ["ai_processing"]);
  });

  it("uden session er /api/patients/me 401", async () => {
    const c = await newClientWithTerms();
    assert.equal((await c.get("/api/patients/me")).status, 401);
    assert.equal((await c.get("/api/me")).status, 401);
  });

  it("anonym kan ikke bruge konto-only endpoints (/api/patients/me)", async () => {
    const { c } = await anonymousWithCase();
    const r = await c.get("/api/patients/me");
    assert.ok([401, 403].includes(r.status), `status ${r.status}`);
  });
});

describe("konvertering til konto", () => {
  it("beholder bruger-id og sag, og sessionen er ikke længere anonym", async () => {
    const { c, userId } = await anonymousWithCase();
    const email = uniqueEmail();
    const r = await c.post("/api/auth/convert", { email, password: PASSWORD, firstName: "Testa" });
    assert.equal(r.status, 200);
    assert.equal(r.body.userId, userId);
    assert.equal(r.body.role, "patient");
    const me = await c.get("/api/me");
    assert.equal(me.body.id, userId);
    assert.equal(me.body.isAnonymous, false);
    assert.equal(me.body.displayName, "Testa");
    const exp = await c.get("/api/patients/me/export");
    assert.equal(exp.status, 200);
    assert.equal(exp.body.cases.length, 1);
    const own = await c.get("/api/patients/me");
    assert.equal(own.status, 200);
  });

  it("kan ikke konvertere uden session eller når allerede konto", async () => {
    const c = await newClientWithTerms();
    const r = await c.post("/api/auth/convert", { email: uniqueEmail(), password: PASSWORD, firstName: "X" });
    assert.equal(r.status, 401);
  });

  it("signup med aktiv anonym session giver 409", async () => {
    const { c } = await anonymousWithCase();
    const r = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "X" });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "ANONYMOUS_SESSION_ACTIVE");
  });
});

describe("patient-signup, login og logout", () => {
  it("signup, /api/me, logout, login igen", async () => {
    const email = uniqueEmail();
    const c = await newClientWithTerms();
    const s = await c.post("/api/auth/signup", { role: "patient", email, password: PASSWORD, firstName: "Signe" });
    assert.equal(s.status, 201);
    assert.equal(s.body.role, "patient");
    createdUserIds.add(s.body.userId);

    const me = await c.get("/api/me");
    assert.equal(me.body.id, s.body.userId);
    assert.equal(me.body.isAnonymous, false);
    assert.equal(me.body.displayName, "Signe");

    const out = await c.post("/api/auth/logout");
    assert.equal(out.status, 204);
    assert.equal((await c.get("/api/me")).status, 401);

    const fresh = await newClientWithTerms();
    const l = await fresh.post("/api/auth/login", { email, password: PASSWORD });
    assert.equal(l.status, 200);
    assert.equal(l.body.userId, s.body.userId);
    assert.equal((await fresh.get("/api/me")).body.id, s.body.userId);
  });

  it("login med forkert adgangskode afvises, login kræver vilkår", async () => {
    const email = uniqueEmail();
    const c = await newClientWithTerms();
    const s = await c.post("/api/auth/signup", { role: "patient", email, password: PASSWORD, firstName: "A" });
    createdUserIds.add(s.body.userId);
    const bad = await (await newClientWithTerms()).post("/api/auth/login", { email, password: "forkert-kode-123" });
    assert.equal(bad.status, 401);
    const noTerms = await new TestClient().post("/api/auth/login", { email, password: PASSWORD });
    assert.equal(noTerms.status, 403);
  });

  it("validerer signup (kort adgangskode, ukendt rolle, dobbelt e-mail)", async () => {
    const c = await newClientWithTerms();
    const short = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: "kort", firstName: "A" });
    assert.equal(short.status, 400);
    const role = await c.post("/api/auth/signup", { role: "admin", email: uniqueEmail(), password: PASSWORD, firstName: "A" });
    assert.equal(role.status, 400);
    const email = uniqueEmail();
    const ok = await c.post("/api/auth/signup", { role: "patient", email, password: PASSWORD, firstName: "A" });
    assert.equal(ok.status, 201);
    createdUserIds.add(ok.body.userId);
    const dup = await (await newClientWithTerms()).post("/api/auth/signup", { role: "patient", email, password: PASSWORD, firstName: "B" });
    assert.ok(dup.status >= 400 && dup.status < 500, `status ${dup.status}`);
  });
});

describe("samtykker", () => {
  it("anonym kan give image_upload, men ikke health_data_sharing", async () => {
    const { c } = await anonymousWithCase();
    const img = await c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION });
    assert.equal(img.status, 201);
    assert.equal(img.body.type, "image_upload");
    const share = await c.post("/api/consents", { type: "health_data_sharing", textVersion: SHARING_CONSENT_VERSION });
    assert.equal(share.status, 403);
    assert.equal(share.body.error.code, "ACCOUNT_REQUIRED");
  });

  it("kontoejer kan give health_data_sharing; forkert version afvises", async () => {
    const { c } = await anonymousWithCase();
    await c.post("/api/auth/convert", { email: uniqueEmail(), password: PASSWORD, firstName: "K" });
    const ok = await c.post("/api/consents", { type: "health_data_sharing", textVersion: SHARING_CONSENT_VERSION });
    assert.equal(ok.status, 201);
    const bad = await c.post("/api/consents", { type: "image_upload", textVersion: "image_upload@gammel" });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "CONSENT_VERSION_MISMATCH");
  });

  it("tilbagetrækning virker; gentagen tilbagetrækning giver 409", async () => {
    const { c } = await anonymousWithCase();
    const g = await c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION });
    const first = await c.post(`/api/consents/${g.body.id}/withdraw`);
    assert.equal(first.status, 200);
    assert.ok(first.body.withdrawnAt);
    assert.equal(first.body.sessionDeleted, false);
    const second = await c.post(`/api/consents/${g.body.id}/withdraw`);
    assert.equal(second.status, 409);
    const list = await c.get("/api/consents");
    const row = list.body.consents.find((x: { id: string; type: string; withdrawnAt: string | null }) => x.id === g.body.id);
    assert.ok(row.withdrawnAt);
  });

  it("tilbagetrækning af ai_processing som anonym sletter hele sessionen", async () => {
    const { c, userId } = await anonymousWithCase();
    const list = await c.get("/api/consents");
    const ai = list.body.consents.find((x: { id: string; type: string; withdrawnAt: string | null }) => x.type === "ai_processing");
    const r = await c.post(`/api/consents/${ai.id}/withdraw`);
    assert.equal(r.status, 200);
    assert.equal(r.body.sessionDeleted, true);
    assert.equal(await userExists(userId), false);
    assert.equal((await c.get("/api/me")).status, 401);
  });

  it("andres samtykke kan ikke trækkes tilbage (404 og samtykket er urørt)", async () => {
    const a = await anonymousWithCase();
    const b = await anonymousWithCase();
    const aiA = (await a.c.get("/api/consents")).body.consents[0];
    const r = await b.c.post(`/api/consents/${aiA.id}/withdraw`);
    assert.ok([403, 404].includes(r.status), `status ${r.status}`);
    const still = (await a.c.get("/api/consents")).body.consents[0];
    assert.equal(still.withdrawnAt ?? null, null);
  });

  it("vilkårs-accept giver ikke samtykke", async () => {
    const c = await newClientWithTerms();
    const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "V" });
    createdUserIds.add(s.body.userId);
    const list = await c.get("/api/consents");
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.consents, []);
    // Ligger accepten i databasen, skal den stadig ikke give samtykker.
    const { data } = await admin.from("consents").select("id").eq("patient_id", s.body.userId);
    assert.deepEqual(data, []);
  });
});

describe("patientdata og kontosletning", () => {
  it("GET/PATCH /api/patients/me og validering", async () => {
    const { c } = await anonymousWithCase();
    await c.post("/api/auth/convert", { email: uniqueEmail(), password: PASSWORD, firstName: "P" });
    const p = await c.request("PATCH", "/api/patients/me", { postalCode: "2100" });
    assert.equal(p.status, 200);
    assert.equal(p.body.postalCode, "2100");
    const bad = await c.request("PATCH", "/api/patients/me", { postalCode: "12" });
    assert.equal(bad.status, 400);
  });

  it("eksport indeholder kun egne data", async () => {
    const a = await anonymousWithCase();
    const b = await anonymousWithCase();
    const exp = await a.c.get("/api/patients/me/export");
    assert.equal(exp.status, 200);
    assert.equal(exp.body.cases.length, 1);
    assert.equal(exp.body.cases[0].id ?? a.caseId, a.caseId);
    assert.equal(exp.body.consents.length, 1);
    assert.ok(!JSON.stringify(exp.body).includes(b.userId));
  });

  it("sletning kræver SLET; derefter 204 og brugeren er væk", async () => {
    const { c, userId } = await anonymousWithCase();
    await c.post("/api/auth/convert", { email: uniqueEmail(), password: PASSWORD, firstName: "S" });
    const no = await c.del("/api/patients/me", { confirm: "slet" });
    assert.equal(no.status, 400);
    assert.equal(await userExists(userId), true);
    const r = await c.del("/api/patients/me", { confirm: "SLET" });
    assert.equal(r.status, 204);
    assert.equal(await userExists(userId), false);
    const { data: cases } = await admin.from("cases").select("id").eq("patient_id", userId);
    assert.deepEqual(cases ?? [], []);
    assert.equal((await c.get("/api/me")).status, 401);
  });

  it("anonym kan slette sig selv", async () => {
    const { c, userId } = await anonymousWithCase();
    const r = await c.del("/api/patients/me", { confirm: "SLET" });
    assert.equal(r.status, 204);
    assert.equal(await userExists(userId), false);
  });
});

describe("oprydningsjob", () => {
  const url = "/api/cron/cleanup-anonymous";
  it("401 uden secret, med forkert secret og uden Bearer", async () => {
    const c = new TestClient();
    assert.equal((await c.post(url)).status, 401);
    assert.equal((await c.post(url, {}, { authorization: "Bearer forkert-forkert-forkert" })).status, 401);
    assert.equal((await c.post(url, {}, { authorization: process.env.CRON_SECRET! })).status, 401);
    assert.equal((await fetch(BASE_URL + url)).status, 401);
  });

  it("200 med korrekt secret; sletter udløbne anonyme sessioner men ikke aktive", async () => {
    const old = await anonymousWithCase();
    const fresh = await anonymousWithCase();
    // Gør den ene session 3 dage gammel (kun testdata, via service role mod lokal DB).
    const longAgo = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const { error } = await admin.from("profiles").update({ last_active_at: longAgo }).eq("id", old.userId);
    assert.equal(error, null, error?.message);
    const r = await new TestClient().post(url, {}, { authorization: `Bearer ${process.env.CRON_SECRET}` });
    assert.equal(r.status, 200);
    assert.ok(r.body.deletedSessions >= 1);
    assert.equal(await userExists(old.userId), false);
    assert.equal(await userExists(fresh.userId), true);
  });
});
