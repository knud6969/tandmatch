// API-tests for glemt adgangskode, nulstilling og skift af login (identity 10.2). Kører mod en rigtig app + lokal Supabase.
// Lokalt sendes ingen e-mails (local_smtp er slået fra): nulstillingslinket laves med admin.generateLink (token_hash).
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD, TestClient, adminClient, newClientWithTerms, randomCvr, uniqueEmail } from "../../../../tests/api/helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();
const NEW_PASSWORD = "nyt-kodeord-4567";

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

async function newClinic() {
  const c = await newClientWithTerms();
  const email = uniqueEmail("klinik");
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email,
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Kodeordsklinikken",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  return { c, email, userId: r.body.userId as string };
}

async function recoveryTokenHash(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  assert.equal(error, null);
  return data.properties!.hashed_token;
}

async function canLogin(email: string, password: string): Promise<boolean> {
  const c = await newClientWithTerms();
  return (await c.post("/api/auth/login", { email, password })).status === 200;
}

describe("glemt adgangskode", () => {
  it("svarer ens (202) for en eksisterende og en ukendt e-mail, også uden vilkårs-accept", async () => {
    const { email } = await newClinic();
    const c = new TestClient();
    const known = await c.post("/api/auth/password/forgot", { email });
    const unknown = await c.post("/api/auth/password/forgot", { email: uniqueEmail("findes-ikke") });
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(known.body, unknown.body);
    assert.deepEqual(known.body, { sent: true });
  });

  it("afviser en redirect fra klienten og kald fra appen", async () => {
    const c = new TestClient();
    const r = await c.post("/api/auth/password/forgot", { email: uniqueEmail(), redirectTo: "https://evil.example/stjael" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "VALIDATION_ERROR");
    const mobile = await c.post("/api/auth/password/forgot", { email: uniqueEmail() }, { "X-TandMatch-Client": "mobile" });
    assert.equal(mobile.status, 400);
  });

  it("har IP-rate limit (10 pr. time)", async () => {
    const c = new TestClient();
    for (let i = 0; i < 10; i++) {
      assert.equal((await c.post("/api/auth/password/forgot", { email: uniqueEmail() })).status, 202, `kald ${i + 1}`);
    }
    const blocked = await c.post("/api/auth/password/forgot", { email: uniqueEmail() });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, "RATE_LIMITED");
  });
});

describe("nulstilling med link", () => {
  it("ugyldig kode giver 400 RECOVERY_INVALID", async () => {
    const c = new TestClient();
    for (const body of [{ tokenHash: "ugyldig-token-hash-123" }, { code: "00000000-0000-0000-0000-000000000000" }]) {
      const r = await c.post("/api/auth/password/recovery", body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error.code, "RECOVERY_INVALID");
    }
  });

  it("link → recovery-session → ny adgangskode; linket kan ikke bruges igen; alle sessioner logges ud", async () => {
    const { c: loggedIn, email } = await newClinic();
    const tokenHash = await recoveryTokenHash(email);
    const c = new TestClient();
    const rec = await c.post("/api/auth/password/recovery", { tokenHash });
    assert.equal(rec.status, 200, JSON.stringify(rec.body));
    assert.equal(rec.headers.get("cache-control"), "no-store");

    const weak = await c.post("/api/auth/password/reset", { password: "kort" });
    assert.equal(weak.status, 400);
    const same = await c.post("/api/auth/password/reset", { password: PASSWORD });
    assert.equal(same.status, 400);
    assert.equal(same.body.error.code, "SAME_PASSWORD");

    const reset = await c.post("/api/auth/password/reset", { password: NEW_PASSWORD });
    assert.equal(reset.status, 204, JSON.stringify(reset.body));
    assert.equal(await canLogin(email, NEW_PASSWORD), true);
    assert.equal(await canLogin(email, PASSWORD), false);

    const again = await new TestClient().post("/api/auth/password/recovery", { tokenHash });
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, "RECOVERY_INVALID");

    // Den gamle cookie-session er tilbagekaldt (global logout); dens adgangstoken kan ikke fornys.
    const refreshed = await loggedIn.request("POST", "/api/auth/account/password", { currentPassword: NEW_PASSWORD, newPassword: "endnu-en-kode-9" });
    assert.notEqual(refreshed.status, 204);
  });

  it("en almindelig login-session kan ikke nulstille uden den nuværende adgangskode (403 RECOVERY_REQUIRED)", async () => {
    const { c } = await newClinic();
    const r = await c.post("/api/auth/password/reset", { password: NEW_PASSWORD });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "RECOVERY_REQUIRED");
    const none = await new TestClient().post("/api/auth/password/reset", { password: NEW_PASSWORD });
    assert.equal(none.status, 403);
    assert.equal(none.body.error.code, "RECOVERY_REQUIRED");
  });
});

describe("skift af adgangskode og e-mail", () => {
  it("GET /api/auth/account viser login-e-mailen; kun klinik", async () => {
    const { c, email } = await newClinic();
    const r = await c.get("/api/auth/account");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { email });

    const patient = await newClientWithTerms();
    const signup = await patient.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Test" });
    createdUserIds.add(signup.body.userId);
    assert.equal((await patient.get("/api/auth/account")).status, 403);
    assert.equal((await new TestClient().get("/api/auth/account")).status, 403);
  });

  it("forkert nuværende adgangskode giver 400; korrekt skifter adgangskoden og bevarer sessionen", async () => {
    const { c, email } = await newClinic();
    const wrong = await c.post("/api/auth/account/password", { currentPassword: "forkert-kode-1", newPassword: NEW_PASSWORD });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, "INVALID_CURRENT_PASSWORD");

    const ok = await c.post("/api/auth/account/password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    assert.equal(ok.status, 204, JSON.stringify(ok.body));
    assert.equal((await c.get("/api/auth/account")).status, 200);
    assert.equal(await canLogin(email, NEW_PASSWORD), true);
    assert.equal(await canLogin(email, PASSWORD), false);
  });

  it("skift af e-mail: forkert adgangskode og samme e-mail afvises; svaret er ens for en ledig og en optaget adresse", async () => {
    const { c, email } = await newClinic();
    const { email: taken } = await newClinic();
    const wrong = await c.post("/api/auth/account/email", { email: uniqueEmail("ny"), currentPassword: "forkert-kode-1" });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, "INVALID_CURRENT_PASSWORD");
    const same = await c.post("/api/auth/account/email", { email, currentPassword: PASSWORD });
    assert.equal(same.body.error.code, "SAME_EMAIL");

    const occupied = await c.post("/api/auth/account/email", { email: taken, currentPassword: PASSWORD });
    const free = await c.post("/api/auth/account/email", { email: uniqueEmail("ny"), currentPassword: PASSWORD });
    assert.equal(occupied.status, free.status);
    assert.deepEqual(occupied.body, free.body);
    // Login-e-mailen er uændret, indtil linket er bekræftet.
    assert.deepEqual((await c.get("/api/auth/account")).body, { email });
  });

  it("afviser appen", async () => {
    const { c } = await newClinic();
    const r = await c.post("/api/auth/account/password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, { "X-TandMatch-Client": "mobile" });
    assert.equal(r.status, 400);
  });
});
