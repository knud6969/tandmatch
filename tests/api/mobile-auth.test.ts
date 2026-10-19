// API-tests for appens auth (architecture 2.4, 2.5, 10.2): Authorization: Bearer, X-Terms-Token og tokens kun med
// X-TandMatch-Client: mobile. Kører mod en rigtig app + lokal Supabase. Klienten her har ingen cookies.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  AI_CONSENT_VERSION,
  BASE_URL,
  IMAGE_CONSENT_VERSION,
  PASSWORD,
  PRIVACY_VERSION,
  TERMS_VERSION,
  TestClient,
  adminClient,
  forgeTermsCookie,
  imageForm,
  jpegWithExif,
  newClientWithTerms,
  randomCvr,
  uniqueEmail,
  type Res,
} from "./helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();
const TEST_TERMS_SECRET = process.env.TERMS_COOKIE_SECRET ?? "test-terms-cookie-secret-0123456789abcdef";
const MOBILE = { "X-TandMatch-Client": "mobile" };

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type Session = { accessToken: string; refreshToken: string; expiresAt: string };

// Som appen: ingen cookies, unikt klient-IP, valgfrit bearer og vilkårs-token.
class AppClient {
  readonly ip = `10.${r()}.${r()}.${r()}`;
  accessToken: string | null = null;
  termsToken: string | null = null;
  mobileHeader = true;

  async request(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...extra };
    if (this.mobileHeader) Object.assign(headers, MOBILE);
    if (this.accessToken && !("Authorization" in extra)) headers.Authorization = `Bearer ${this.accessToken}`;
    if (this.termsToken && !("X-Terms-Token" in extra)) headers["X-Terms-Token"] = this.termsToken;
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) headers["content-type"] = "application/json";
    const res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      redirect: "manual",
    });
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
  get(path: string, extra?: Record<string, string>) {
    return this.request("GET", path, undefined, extra);
  }
  post(path: string, body: unknown = {}, extra?: Record<string, string>) {
    return this.request("POST", path, body, extra);
  }

  async acceptTerms(): Promise<void> {
    const res = await this.post("/api/terms/accept", { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
    assert.equal(res.status, 200);
    this.termsToken = res.body.termsToken;
  }
  use(session: Session) {
    this.accessToken = session.accessToken;
  }
}

function r() {
  return 1 + Math.floor(Math.random() * 250);
}

async function appWithTerms(): Promise<AppClient> {
  const app = new AppClient();
  await app.acceptTerms();
  return app;
}

function noCookies(res: Res) {
  assert.equal(res.headers.getSetCookie().length, 0, "svaret må ikke sætte cookies");
}

async function appPatient(): Promise<{ app: AppClient; session: Session; email: string; userId: string }> {
  const app = await appWithTerms();
  const email = uniqueEmail("app");
  const res = await app.post("/api/auth/signup", { role: "patient", email, password: PASSWORD, firstName: "Mia" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  createdUserIds.add(res.body.userId);
  app.use(res.body.session);
  return { app, session: res.body.session, email, userId: res.body.userId };
}

function signTerms(payload: Record<string, string>, secret = TEST_TERMS_SECRET): string {
  const b64 = (b: Buffer) => b.toString("base64url");
  const body = b64(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("vilkårstoken (X-Terms-Token)", () => {
  it("terms/accept: uden headeren cookie og ingen token; med headeren token og ingen cookie", async () => {
    const web = new TestClient();
    const cookieRes = await web.acceptTerms();
    assert.equal(cookieRes.status, 200);
    assert.equal(cookieRes.body.termsToken, undefined);
    assert.ok(web.cookies.has("tm_terms"));

    const app = new AppClient();
    const res = await app.post("/api/terms/accept", { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.termsToken, "string");
    assert.equal(res.headers.get("cache-control"), "no-store");
    noCookies(res);
  });

  it("et gyldigt token åbner gaten; mangler, forfalsket, forældet og skrald giver 403 TERMS_REQUIRED", async () => {
    const app = await appWithTerms();
    const badLogin = { email: uniqueEmail(), password: "forkert-adgangskode" };
    const ok = await app.post("/api/auth/login", badLogin);
    assert.equal(ok.status, 401); // forbi gaten, forkert login
    assert.equal(ok.body.error.code, "INVALID_CREDENTIALS");

    const stale = signTerms({ termsVersion: "v-gammel", privacyVersion: PRIVACY_VERSION, acceptedAt: new Date().toISOString() });
    const forged = forgeTermsCookie("en-helt-anden-hemmelighed-der-er-lang-nok-123");
    for (const token of [stale, forged, "skrald", "a.b", ""]) {
      const res = await app.post("/api/auth/login", badLogin, { "X-Terms-Token": token });
      assert.equal(res.status, 403, token);
      assert.equal(res.body.error.code, "TERMS_REQUIRED");
    }
    const none = new AppClient();
    const res = await none.post("/api/auth/login", badLogin);
    assert.equal(res.status, 403);
  });

  it("med bearer læses en vilkårs-cookie ikke (kun headeren)", async () => {
    const { app } = await appPatient();
    const web = new TestClient();
    await web.acceptTerms();
    // Ingen X-Terms-Token, men en gyldig cookie: uden session ville cookien åbne gaten. Her bruges den ikke.
    const anon = new AppClient();
    const res = await anon.post("/api/auth/login", { email: uniqueEmail(), password: "x" }, { cookie: `tm_terms=${web.cookies.get("tm_terms")}` });
    assert.equal(res.status, 403);
    assert.equal(app.accessToken !== null, true);
  });
});

describe("tokens kun til appen", () => {
  it("signup, login og me med bearer; tokens og ingen Set-Cookie", async () => {
    const { app, session, email, userId } = await appPatient();
    assert.match(session.accessToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.ok(session.refreshToken.length > 5);
    assert.ok(new Date(session.expiresAt).getTime() > Date.now());

    const me = await app.get("/api/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.id, userId);
    assert.equal(me.body.role, "patient");

    const login = await (await appWithTerms()).post("/api/auth/login", { email, password: PASSWORD });
    assert.equal(login.status, 200);
    assert.equal(login.body.role, "patient");
    assert.ok(login.body.session.accessToken);
    noCookies(login);
    assert.equal(login.headers.get("cache-control"), "no-store");
  });

  it("uden headeren er svarene som før: ingen session i body, cookies sat", async () => {
    const web = await newClientWithTerms();
    const email = uniqueEmail("web");
    const res = await web.post("/api/auth/signup", { role: "patient", email, password: PASSWORD, firstName: "Web" });
    assert.equal(res.status, 201);
    createdUserIds.add(res.body.userId);
    assert.deepEqual(Object.keys(res.body).sort(), ["role", "userId"]);
    assert.ok([...web.cookies.keys()].some((k) => k.startsWith("sb-")));
    const anon = await newClientWithTerms();
    const a = await anon.startAnonymous();
    assert.equal(a.status, 201);
    assert.equal(a.body.session, undefined);
  });

  it("signup af klinik fra appen giver 400 og opretter intet", async () => {
    const app = await appWithTerms();
    const email = uniqueEmail("klinik");
    const res = await app.post("/api/auth/signup", {
      role: "clinic",
      email,
      password: PASSWORD,
      cvr: randomCvr(),
      clinicName: "Appklinik",
      address: "Testvej 1",
      postalCode: "2100",
      city: "København Ø",
      phone: "00 00 00 01",
    });
    assert.equal(res.status, 400);
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    assert.ok(!data.users.some((u) => u.email === email));
  });

  it("anonym session: 201 med tokens, retry med bearer giver 200 uden tokens; convert giver nye tokens", async () => {
    const app = await appWithTerms();
    const body = { aiConsent: { textVersion: AI_CONSENT_VERSION } };
    const created = await app.post("/api/session/anonymous", body);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    noCookies(created);
    assert.ok(created.body.session.accessToken);
    app.use(created.body.session);
    const me = await app.get("/api/me");
    assert.equal(me.body.isAnonymous, true);
    createdUserIds.add(me.body.id);

    const retry = await app.post("/api/session/anonymous", body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.caseId, created.body.caseId);
    assert.equal(retry.body.session, undefined);

    const email = uniqueEmail("konv");
    const conv = await app.post("/api/auth/convert", { email, password: PASSWORD, firstName: "Ida" });
    assert.equal(conv.status, 200, JSON.stringify(conv.body));
    noCookies(conv);
    assert.equal(conv.body.userId, me.body.id);
    assert.ok(conv.body.session.accessToken);
    app.use(conv.body.session);
    const after = await app.get("/api/me");
    assert.equal(after.body.isAnonymous, false);
    assert.equal(after.body.id, me.body.id);
    const again = await app.post("/api/auth/convert", { email: uniqueEmail(), password: PASSWORD, firstName: "Ida" });
    assert.equal(again.status, 403);
    assert.equal(again.body.error.code, "NOT_ANONYMOUS");
  });
});

describe("bearer", () => {
  it("ugyldigt bearer giver 401, også med gyldig cookie; en cookie læses aldrig sammen med bearer", async () => {
    const web = await newClientWithTerms();
    const signup = await web.post("/api/auth/signup", { role: "patient", email: uniqueEmail("cookie"), password: PASSWORD, firstName: "Cookie" });
    assert.equal(signup.status, 201);
    createdUserIds.add(signup.body.userId);
    const cookie = [...web.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    assert.equal((await web.get("/api/me")).status, 200);

    const app = new AppClient();
    app.mobileHeader = false;
    for (const authorization of ["Bearer skrald", "Bearer a.b.c", "Basic abc", "Bearer", "Bearer  "]) {
      const res = await app.get("/api/me", { Authorization: authorization, cookie });
      assert.equal(res.status, 401, authorization);
      assert.equal(res.body.error.code, "UNAUTHENTICATED");
    }
    // Gyldig cookie uden bearer men med mobil-headeren: cookien ignoreres.
    const mobileOnly = new AppClient();
    const res = await mobileOnly.get("/api/me", { cookie });
    assert.notEqual(res.status, 200);

    // To forskellige brugere: bearer (A) vinder altid over cookie (B).
    const a = await appPatient();
    const mixed = await a.app.get("/api/me", { cookie });
    assert.equal(mixed.status, 200);
    assert.equal(mixed.body.id, a.userId);
    assert.notEqual(mixed.body.id, signup.body.userId);
  });

  it("bearer virker uden mobil-headeren (men så uden tokens i svar)", async () => {
    const { app } = await appPatient();
    app.mobileHeader = false;
    const res = await app.get("/api/me");
    assert.equal(res.status, 200);
  });

  it("isolation: patient B ser ikke patient A's sag; klinik-bearer afvises på patientroute", async () => {
    const a = await appPatient();
    const b = await appPatient();
    const created = await a.app.post("/api/cases");
    assert.equal(created.status, 201);
    const caseId = created.body.id as string;
    assert.equal((await a.app.get(`/api/cases/${caseId}`)).status, 200);
    const other = await b.app.get(`/api/cases/${caseId}`);
    assert.equal(other.status, 404);
    const listB = await b.app.get("/api/cases");
    assert.ok(!JSON.stringify(listB.body).includes(caseId));

    // Klinik logger ind fra appen (login accepterer alle roller; appen afviser selv klinikker), men får ingen patientdata.
    const web = await newClientWithTerms();
    const email = uniqueEmail("klinik");
    const signup = await web.post("/api/auth/signup", {
      role: "clinic",
      email,
      password: PASSWORD,
      cvr: randomCvr(),
      clinicName: "Isolationsklinik",
      address: "Testvej 1",
      postalCode: "2100",
      city: "København Ø",
      phone: "00 00 00 01",
    });
    assert.equal(signup.status, 201);
    createdUserIds.add(signup.body.userId);
    const clinicApp = await appWithTerms();
    const login = await clinicApp.post("/api/auth/login", { email, password: PASSWORD });
    assert.equal(login.status, 200);
    clinicApp.use(login.body.session);
    for (const path of ["/api/cases", `/api/cases/${caseId}`, "/api/patients/me"]) {
      const res = await clinicApp.get(path);
      assert.ok(res.status === 403 || res.status === 404, `${path}: ${res.status}`);
    }
  });

  it("billedupload med bearer giver 201 (kræver stadig billedsamtykke)", async () => {
    const app = await appWithTerms();
    const created = await app.post("/api/session/anonymous", { aiConsent: { textVersion: AI_CONSENT_VERSION } });
    app.use(created.body.session);
    const me = await app.get("/api/me");
    createdUserIds.add(me.body.id);
    const caseId = created.body.caseId as string;
    const image = await jpegWithExif();
    const denied = await app.post(`/api/cases/${caseId}/images`, imageForm(image));
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "CONSENT_REQUIRED");
    const consent = await app.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION });
    assert.equal(consent.status, 201);
    const ok = await app.post(`/api/cases/${caseId}/images`, imageForm(image));
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
  });

  it("sender ingen CORS-headere", async () => {
    const app = await appWithTerms();
    for (const res of [await app.get("/api/terms/status", { Origin: "https://example.test" }), await app.get("/api/me")]) {
      assert.equal(res.headers.get("access-control-allow-origin"), null);
    }
    const pre = await fetch(`${BASE_URL}/api/me`, {
      method: "OPTIONS",
      headers: { Origin: "https://example.test", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" },
    });
    assert.equal(pre.headers.get("access-control-allow-origin"), null);
  });
});

describe("refresh og logout", () => {
  it("refresh giver nye tokens; et genbrugt refresh-token afvises efter reuse-intervallet", async () => {
    const { app, session } = await appPatient();
    const first = await app.post("/api/auth/refresh", { refreshToken: session.refreshToken });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    noCookies(first);
    assert.equal(first.headers.get("cache-control"), "no-store");
    const next: Session = first.body.session;
    assert.notEqual(next.refreshToken, session.refreshToken);
    assert.ok(next.accessToken);
    app.use(next);
    assert.equal((await app.get("/api/me")).status, 200);

    // Refresh virker også med et udløbet/ugyldigt adgangstoken i Authorization, og kræver hverken vilkårs-token eller login.
    const bare = new AppClient();
    const viaStale = await bare.post("/api/auth/refresh", { refreshToken: next.refreshToken }, { Authorization: "Bearer udloebet" });
    assert.equal(viaStale.status, 200);
    const newest: Session = viaStale.body.session;

    await sleep(11_000); // refresh_token_reuse_interval = 10 sekunder (supabase/config.toml)
    const reused = await bare.post("/api/auth/refresh", { refreshToken: session.refreshToken });
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error.code, "UNAUTHENTICATED");
    assert.ok(!JSON.stringify(reused.body).includes(session.refreshToken));
    assert.ok(newest.refreshToken);
  });

  it("refresh kræver mobil-headeren og et gyldigt, strikt input", async () => {
    const app = await appWithTerms();
    const web = new AppClient();
    web.mobileHeader = false;
    assert.equal((await web.post("/api/auth/refresh", { refreshToken: "x" })).status, 400);
    assert.equal((await app.post("/api/auth/refresh", { refreshToken: "findes-ikke" })).status, 401);
    assert.equal((await app.post("/api/auth/refresh", {})).status, 400);
    assert.equal((await app.post("/api/auth/refresh", { refreshToken: "x", ekstra: 1 })).status, 400);
    assert.equal((await app.post("/api/auth/refresh", { refreshToken: "x".repeat(600) })).status, 400);
  });

  it("logout med bearer giver 204 og gør refresh-tokenet ugyldigt; uden session er logout også 204", async () => {
    const { app, session } = await appPatient();
    const out = await app.post("/api/auth/logout");
    assert.equal(out.status, 204);
    noCookies(out);
    const refreshed = await app.post("/api/auth/refresh", { refreshToken: session.refreshToken });
    assert.equal(refreshed.status, 401);
    const me = await app.get("/api/me");
    assert.equal(me.status, 401);

    const nobody = new AppClient();
    assert.equal((await nobody.post("/api/auth/logout")).status, 204);
    assert.equal((await nobody.post("/api/auth/logout", {}, { Authorization: "Bearer skrald" })).status, 204);
  });
});
