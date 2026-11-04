// API-tests for klinikkens notifikationsindstillinger og web push-abonnementer (clinics 10.19, platform 14).
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD, TestClient, adminClient, newClientWithTerms, randomCvr, uniqueEmail } from "../../../../tests/api/helpers.ts";

assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^http:\/\/(127\.0\.0\.1|localhost):/, "kun lokal Supabase");

const admin = adminClient();
const createdUserIds = new Set<string>();
after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

async function clinic(): Promise<{ c: TestClient; userId: string }> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", { role: "clinic", email: uniqueEmail("klinik"), password: PASSWORD, cvr: randomCvr(), clinicName: "Indstillingsklinik ApS", address: "Testvej 1", postalCode: "2100", city: "København Ø", phone: "00 00 00 01" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  return { c, userId: r.body.userId };
}

async function patient(): Promise<TestClient> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Lea" });
  assert.equal(r.status, 201);
  createdUserIds.add(r.body.userId);
  return c;
}

const DEFAULTS = {
  emailNewLead: true, emailNewMessage: true, emailBookingChanges: true, emailBookingReminder: true,
  webPushNewLead: true, webPushNewMessage: true, webPushBookingChanges: true, webPushBookingReminder: false,
};
const URL = "/api/clinics/me/notification-settings";

describe("GET/PUT /api/clinics/me/notification-settings", () => {
  it("GET uden række giver standardværdierne; PUT og GET igen", async () => {
    const k = await clinic();
    const first = await k.c.get(URL);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, DEFAULTS);
    const changed = { ...DEFAULTS, emailNewLead: false, emailBookingReminder: false, webPushBookingReminder: true };
    const put = await k.c.put(URL, changed);
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.deepEqual(put.body, changed);
    assert.deepEqual((await k.c.get(URL)).body, changed);
    const again = await k.c.put(URL, DEFAULTS);
    assert.deepEqual(again.body, DEFAULTS, "en ny gemning overskriver");
  });

  it("ukendt eller manglende felt giver 400", async () => {
    const k = await clinic();
    assert.equal((await k.c.put(URL, { ...DEFAULTS, extra: true })).status, 400);
    const { emailNewLead: _omit, ...missing } = DEFAULTS;
    void _omit;
    assert.equal((await k.c.put(URL, missing)).status, 400);
    assert.equal((await k.c.put(URL, { ...DEFAULTS, emailNewLead: "ja" })).status, 400);
  });

  it("patient får 403, uden session 401", async () => {
    const p = await patient();
    assert.equal((await p.get(URL)).status, 403);
    assert.equal((await p.put(URL, DEFAULTS)).status, 403);
    assert.equal((await (await newClientWithTerms()).get(URL)).status, 401);
  });

  it("klinik Y ser og ændrer ikke klinik X's valg", async () => {
    const x = await clinic();
    const y = await clinic();
    const changed = { ...DEFAULTS, emailNewMessage: false };
    assert.equal((await x.c.put(URL, changed)).status, 200);
    assert.deepEqual((await y.c.get(URL)).body, DEFAULTS);
    assert.equal((await y.c.put(URL, { ...DEFAULTS, emailNewLead: false })).status, 200);
    assert.deepEqual((await x.c.get(URL)).body, changed);
  });
});

const ENDPOINT = () => `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
const KEYS = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
const subRows = async (endpoint: string) => (await admin.from("web_push_subscriptions").select("user_id").eq("endpoint", endpoint)).data ?? [];

describe("POST/DELETE /api/web-push-subscriptions", () => {
  it("klinik registrerer og afmelder et abonnement (204)", async () => {
    const k = await clinic();
    const endpoint = ENDPOINT();
    assert.equal((await k.c.post("/api/web-push-subscriptions", { endpoint, keys: KEYS })).status, 204);
    assert.deepEqual(await subRows(endpoint), [{ user_id: k.userId }]);
    assert.equal((await k.c.post("/api/web-push-subscriptions", { endpoint, keys: KEYS })).status, 204);
    assert.equal((await subRows(endpoint)).length, 1);
    assert.equal((await k.c.del("/api/web-push-subscriptions", { endpoint })).status, 204);
    assert.equal((await subRows(endpoint)).length, 0);
  });

  it("samme endpoint fra en anden klinik flytter det; en fremmed kan ikke slette det", async () => {
    const a = await clinic();
    const b = await clinic();
    const endpoint = ENDPOINT();
    await a.c.post("/api/web-push-subscriptions", { endpoint, keys: KEYS });
    assert.equal((await b.c.del("/api/web-push-subscriptions", { endpoint })).status, 204);
    assert.equal((await subRows(endpoint)).length, 1, "B kan ikke slette A's abonnement");
    await b.c.post("/api/web-push-subscriptions", { endpoint, keys: KEYS });
    assert.deepEqual(await subRows(endpoint), [{ user_id: b.userId }]);
  });

  it("kun https hos en kendt push-tjeneste, gyldige nøgler og ingen ukendte felter", async () => {
    const k = await clinic();
    for (const body of [
      { endpoint: "http://fcm.googleapis.com/x", keys: KEYS },
      { endpoint: "https://evil.example/x", keys: KEYS },
      { endpoint: "https://169.254.169.254/x", keys: KEYS },
      { endpoint: ENDPOINT(), keys: { p256dh: "kort", auth: KEYS.auth } },
      { endpoint: ENDPOINT(), keys: { ...KEYS, extra: 1 } },
      { endpoint: ENDPOINT(), keys: KEYS, extra: 1 },
      { endpoint: ENDPOINT() },
    ]) {
      const r = await k.c.post("/api/web-push-subscriptions", body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error.code, "VALIDATION_ERROR");
    }
  });

  it("patient 403, uden session 401, appen (bearer/mobile-klient) 400", async () => {
    const p = await patient();
    assert.equal((await p.post("/api/web-push-subscriptions", { endpoint: ENDPOINT(), keys: KEYS })).status, 403);
    assert.equal((await (await newClientWithTerms()).post("/api/web-push-subscriptions", { endpoint: ENDPOINT(), keys: KEYS })).status, 401);
    const k = await clinic();
    const mobile = await k.c.post("/api/web-push-subscriptions", { endpoint: ENDPOINT(), keys: KEYS }, { "x-tandmatch-client": "mobile" });
    assert.equal(mobile.status, 400);
  });
});
