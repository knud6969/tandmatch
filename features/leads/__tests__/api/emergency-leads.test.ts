// API-tests for trin 7.3: akutvejen, POST /api/emergency-leads (architecture 5.3, 10.11).
// Kører mod en rigtig app + lokal Supabase (run.sh afviser alt andet end localhost). Alt er fiktivt og ryddes til sidst.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD, SHARING_CONSENT_VERSION, TestClient, adminClient, newClientWithTerms, randomCvr, uniqueEmail } from "../../../../tests/api/helpers.ts";

assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^http:\/\/(127\.0\.0\.1|localhost):/, "kun lokal Supabase");

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type Clinic = { c: TestClient; id: string };
type Slot = { startsAt: string; endsAt: string };

const code = (r: { body: { error?: { code: string } } }) => r.body.error?.code;

// Verificeret klinik med almindeligt vindue 06-16 og akutvindue 16-23:45 alle ugens dage.
async function clinic(verified = true): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Akuttest Tandklinik",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const id = (await c.get("/api/me")).body.clinic.id as string;
  // [PROTOTYPE] Nye klinikker auto-verificeres ved oprettelse; en ikke-verificeret testklinik sættes eksplicit til registered.
  if (!verified) assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "registered" })).error);
  if (verified) {
    assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "verified" })).error);
    const hours = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
      { clinic_id: id, weekday, opens_at: "06:00", closes_at: "16:00", is_emergency: false },
      { clinic_id: id, weekday, opens_at: "16:00", closes_at: "23:45", is_emergency: true },
    ]);
    assert.ifError((await admin.from("clinic_opening_hours").insert(hours)).error);
  }
  return { c, id };
}

async function patient(consent = true): Promise<TestClient> {
  const c = await newClientWithTerms();
  const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Lea" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  if (consent) {
    assert.equal((await c.post("/api/consents", { type: "health_data_sharing", textVersion: SHARING_CONSENT_VERSION })).status, 201);
  }
  return c;
}

const services = (async () => {
  const c = await newClientWithTerms();
  const all = (await c.get("/api/services")).body.groups.flatMap((g: { services: { id: string; category: string }[] }) => g.services);
  return {
    emergency: all.find((s: { category: string }) => s.category === "emergency").id as string,
    regular: all.find((s: { category: string }) => s.category !== "emergency").id as string,
  };
})();

// En ledig akuttid via den offentlige availability-rute.
async function slots(k: Clinic, serviceId: string): Promise<Slot[]> {
  const c = await newClientWithTerms();
  const r = await c.get(`/api/clinics/${k.id}/availability?serviceId=${serviceId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.slots.length > 0, "der skal være ledige tider");
  return r.body.slots;
}

const body = (k: Clinic, serviceId: string, startsAt: string, extra: Record<string, unknown> = {}) => ({
  clinicId: k.id,
  serviceId,
  startsAt,
  description: "Jeg har ondt i en kindtand og kan ikke sove.",
  contactName: "Lea Testesen",
  contactPhone: "+45 12 34 56 78",
  ...extra,
});

describe("POST /api/emergency-leads", () => {
  it("opretter sag, lead og reservation i ét kald (201, held)", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const p = await patient();
    const [slot] = await slots(k, emergency);
    const r = await p.post("/api/emergency-leads", body(k, emergency, slot.startsAt, { postalCode: "2100" }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(r.body.caseId);
    assert.equal(r.body.lead.clinic.id, k.id);
    assert.equal(r.body.lead.status, "sent");
    assert.equal(r.body.lead.booking.status, "held");
    assert.ok(r.body.lead.booking.holdExpiresAt);
    assert.equal(r.body.lead.booking.startsAt, slot.startsAt);

    // Sagen er sendt, akut og godkendt
    const c = (await p.get("/api/cases")).body.cases.find((x: { id: string }) => x.id === r.body.caseId);
    assert.ok(c, "sagen findes på patientens liste");

    // Klinikken ser akut-leadet uden kontaktfelter og uden patientens id
    const detail = await k.c.get(`/api/leads/${r.body.lead.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.isEmergency, true);
    assert.equal(detail.body.booking.status, "held");
    assert.equal(detail.body.booking.contact, null);
    // Akut-fristen (10.9, migration 20261101000200): listen og detaljen viser reservationens udløb, uden kontaktfelter.
    assert.equal(detail.body.holdExpiresAt, detail.body.booking.holdExpiresAt);
    const listed = (await k.c.get("/api/leads")).body.leads.find((l: { id: string }) => l.id === r.body.lead.id);
    assert.equal(listed.holdExpiresAt, detail.body.booking.holdExpiresAt);
    assert.equal(listed.summaryExcerpt.length > 0, true);
    for (const secret of ["Lea Testesen", "+45 12 34 56 78", r.body.caseId]) {
      assert.ok(!JSON.stringify(listed).includes(secret), `listen lækker ${secret}`);
    }
    for (const secret of ["Lea Testesen", "+45 12 34 56 78", r.body.caseId]) {
      assert.ok(!JSON.stringify(detail.body).includes(secret), `lækker ${secret}`);
    }
  });

  it("anonym: 403 ACCOUNT_REQUIRED; uden samtykke: 403 CONSENT_REQUIRED", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const [slot] = await slots(k, emergency);
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    const a = await anon.post("/api/emergency-leads", body(k, emergency, slot.startsAt));
    assert.equal(a.status, 403);
    assert.equal(code(a), "ACCOUNT_REQUIRED");
    const noConsent = await patient(false);
    const n = await noConsent.post("/api/emergency-leads", body(k, emergency, slot.startsAt));
    assert.equal(n.status, 403);
    assert.equal(code(n), "CONSENT_REQUIRED");
    assert.equal((await noConsent.get("/api/cases")).body.cases.length, 0, "ingen halv sag");
  });

  it("validerer input og afviser en ydelse, der ikke er akut", async () => {
    const { emergency, regular } = await services;
    const k = await clinic();
    const p = await patient();
    const [slot] = await slots(k, emergency);
    const notEmergency = await p.post("/api/emergency-leads", body(k, regular, slot.startsAt));
    assert.equal(notEmergency.status, 400);
    assert.equal(code(notEmergency), "UNKNOWN_SERVICE");
    for (const extra of [{ description: "for kort" }, { contactPhone: "1234567" }, { contactName: "A" }, { postalCode: "12" }, { ekstra: 1 }]) {
      const r = await p.post("/api/emergency-leads", body(k, emergency, slot.startsAt, extra));
      assert.equal(r.status, 400, JSON.stringify(extra));
      assert.equal(code(r), "VALIDATION_ERROR", JSON.stringify(extra));
    }
    const unknownPostal = await p.post("/api/emergency-leads", body(k, emergency, slot.startsAt, { postalCode: "0001" }));
    assert.equal(unknownPostal.status, 400);
    assert.equal(code(unknownPostal), "UNKNOWN_POSTAL_CODE");
    const unverified = await clinic(false);
    const u = await p.post("/api/emergency-leads", body(unverified, emergency, slot.startsAt));
    assert.equal(u.status, 409);
    assert.equal(code(u), "CLINIC_NOT_AVAILABLE");
    assert.equal((await p.get("/api/cases")).body.cases.length, 0, "ingen halv sag efter afvisninger");
  });

  it("samme tid to gange: 409 SLOT_TAKEN til den anden, som ikke får en halv sag", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const first = await patient();
    const second = await patient();
    const [slot] = await slots(k, emergency);
    assert.equal((await first.post("/api/emergency-leads", body(k, emergency, slot.startsAt))).status, 201);
    const r = await second.post("/api/emergency-leads", body(k, emergency, slot.startsAt));
    assert.equal(r.status, 409);
    assert.equal(code(r), "SLOT_TAKEN");
    assert.equal((await second.get("/api/cases")).body.cases.length, 0);
    const free = await slots(k, emergency);
    assert.ok(!free.some((s) => s.startsAt === slot.startsAt), "tiden er ikke længere ledig");
  });

  it("klinikkens accept inden for reservationen gør leadet booked; afvisning frigiver tiden", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const p1 = await patient();
    const p2 = await patient();
    const all = await slots(k, emergency);
    const slot = all[0];
    const slot2 = all[4]; // ligger efter den første tid, så de to ikke overlapper
    const one = await p1.post("/api/emergency-leads", body(k, emergency, slot.startsAt));
    assert.equal(one.status, 201, JSON.stringify(one.body));
    const accepted = await k.c.post(`/api/leads/${one.body.lead.id}/decision`, { decision: "accept" });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.status, "booked");
    assert.equal(accepted.body.booking.status, "booked");
    // Efter accept er tiden booket, og der er ingen frist længere.
    assert.equal(accepted.body.holdExpiresAt, null);
    const acceptedItem = (await k.c.get("/api/leads")).body.leads.find((l: { id: string }) => l.id === one.body.lead.id);
    assert.equal(acceptedItem.holdExpiresAt, null);
    const mine = (await p1.get(`/api/cases/${one.body.caseId}/leads`)).body.leads[0];
    assert.equal(mine.status, "booked");
    assert.equal(mine.booking.status, "booked");

    const two = await p2.post("/api/emergency-leads", body(k, emergency, slot2.startsAt));
    assert.equal(two.status, 201, JSON.stringify(two.body));
    const declined = await k.c.post(`/api/leads/${two.body.lead.id}/decision`, { decision: "decline", reason: "no_capacity" });
    assert.equal(declined.status, 200, JSON.stringify(declined.body));
    const p3 = await patient();
    const three = await p3.post("/api/emergency-leads", body(k, emergency, slot2.startsAt));
    assert.equal(three.status, 201, JSON.stringify(three.body));
  });

  it("kræver login og vilkår", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const [slot] = await slots(k, emergency);
    const noLogin = await newClientWithTerms();
    assert.equal((await noLogin.post("/api/emergency-leads", body(k, emergency, slot.startsAt))).status, 401);
    assert.equal((await k.c.post("/api/emergency-leads", body(k, emergency, slot.startsAt))).status, 403);
  });
});
