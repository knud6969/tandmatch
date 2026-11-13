// API-tests for akutvejen (architecture 5.3, 10.11; vendt om 2026-11-13): POST /api/emergency-leads uden tid, klinikkens
// forslag via POST /api/leads/{id}/decision og patientens bekræftelse via POST /api/bookings/{id}/confirm.
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

// Verificeret klinik med åbent 06-23:45 alle ugens dage, så der altid er en tid at foreslå.
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
    const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ clinic_id: id, weekday, opens_at: "06:00", closes_at: "23:45" }));
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

// Klinikkens egne ledige tider til et forslag på et ubesvaret akut-lead (GET /api/leads/{id}/availability som klinik).
async function slots(k: Clinic, leadId: string, serviceId: string): Promise<Slot[]> {
  const r = await k.c.get(`/api/leads/${leadId}/availability?serviceId=${serviceId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.slots.length > 0, "der skal være ledige tider");
  return r.body.slots;
}

const body = (k: Clinic, serviceId: string, extra: Record<string, unknown> = {}) => ({
  clinicId: k.id,
  serviceId,
  description: "Jeg har ondt i en kindtand og kan ikke sove.",
  contactName: "Lea Testesen",
  contactPhone: "+45 12 34 56 78",
  ...extra,
});

describe("POST /api/emergency-leads", () => {
  it("opretter sag og lead uden tid (201, ingen booking); klinikken ser ingen kontakt", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const p = await patient();
    const r = await p.post("/api/emergency-leads", body(k, emergency, { postalCode: "2100" }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(r.body.caseId);
    assert.equal(r.body.lead.clinic.id, k.id);
    assert.equal(r.body.lead.status, "sent");
    assert.equal(r.body.lead.booking, null);

    const c = (await p.get("/api/cases")).body.cases.find((x: { id: string }) => x.id === r.body.caseId);
    assert.ok(c, "sagen findes på patientens liste");

    const detail = await k.c.get(`/api/leads/${r.body.lead.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.isEmergency, true);
    assert.equal(detail.body.booking, null);
    assert.equal(detail.body.holdExpiresAt, null);
    const listed = (await k.c.get("/api/leads")).body.leads.find((l: { id: string }) => l.id === r.body.lead.id);
    assert.equal(listed.summaryExcerpt.length > 0, true);
    for (const secret of ["Lea Testesen", "+45 12 34 56 78", r.body.caseId]) {
      assert.ok(!JSON.stringify(listed).includes(secret), `listen lækker ${secret}`);
      assert.ok(!JSON.stringify(detail.body).includes(secret), `detaljen lækker ${secret}`);
    }
  });

  it("anonym: 403 ACCOUNT_REQUIRED; uden samtykke: 403 CONSENT_REQUIRED", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    const a = await anon.post("/api/emergency-leads", body(k, emergency));
    assert.equal(a.status, 403);
    assert.equal(code(a), "ACCOUNT_REQUIRED");
    const noConsent = await patient(false);
    const n = await noConsent.post("/api/emergency-leads", body(k, emergency));
    assert.equal(n.status, 403);
    assert.equal(code(n), "CONSENT_REQUIRED");
    assert.equal((await noConsent.get("/api/cases")).body.cases.length, 0, "ingen halv sag");
  });

  it("validerer input og afviser en ydelse, der ikke er akut, og en gammel startsAt", async () => {
    const { emergency, regular } = await services;
    const k = await clinic();
    const p = await patient();
    const notEmergency = await p.post("/api/emergency-leads", body(k, regular));
    assert.equal(notEmergency.status, 400);
    assert.equal(code(notEmergency), "UNKNOWN_SERVICE");
    for (const extra of [{ description: "for kort" }, { contactPhone: "1234567" }, { contactName: "A" }, { postalCode: "12" }, { ekstra: 1 }, { startsAt: new Date().toISOString() }]) {
      const r = await p.post("/api/emergency-leads", body(k, emergency, extra));
      assert.equal(r.status, 400, JSON.stringify(extra));
      assert.equal(code(r), "VALIDATION_ERROR", JSON.stringify(extra));
    }
    const unknownPostal = await p.post("/api/emergency-leads", body(k, emergency, { postalCode: "0001" }));
    assert.equal(unknownPostal.status, 400);
    assert.equal(code(unknownPostal), "UNKNOWN_POSTAL_CODE");
    const unverified = await clinic(false);
    const u = await p.post("/api/emergency-leads", body(unverified, emergency));
    assert.equal(u.status, 409);
    assert.equal(code(u), "CLINIC_NOT_AVAILABLE");
    assert.equal((await p.get("/api/cases")).body.cases.length, 0, "ingen halv sag efter afvisninger");
  });

  it("klinikken foreslår en tid; patienten bekræfter, og først da ser klinikken kontakten", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const p = await patient();
    const sent = await p.post("/api/emergency-leads", body(k, emergency));
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const leadId = sent.body.lead.id as string;

    // Accept uden tid afvises; patienten kan ikke hente klinikkens forslagstider
    const noTime = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
    assert.equal(noTime.status, 400);
    assert.equal(code(noTime), "VALIDATION_ERROR");
    assert.equal((await p.get(`/api/leads/${leadId}/availability?serviceId=${emergency}`)).status, 409, "patienten: lead ikke accepteret");

    const [slot] = await slots(k, leadId, emergency);
    const proposed = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept", comment: "Kom bare", proposedStartsAt: slot.startsAt });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.equal(proposed.body.status, "accepted");
    assert.equal(proposed.body.booking.status, "held");
    assert.equal(proposed.body.booking.startsAt, slot.startsAt);
    assert.equal(proposed.body.booking.contact, null);
    assert.ok(proposed.body.holdExpiresAt);
    // Efter svaret kan klinikken ikke længere hente forslagstider
    assert.equal((await k.c.get(`/api/leads/${leadId}/availability?serviceId=${emergency}`)).status, 409);

    const mine = (await p.get(`/api/cases/${sent.body.caseId}/leads`)).body.leads[0];
    assert.equal(mine.status, "accepted");
    assert.equal(mine.booking.status, "held");
    assert.ok(mine.booking.holdExpiresAt);

    // En anden patient kan ikke bekræfte; klinikken heller ikke
    const other = await patient();
    assert.equal((await other.post(`/api/bookings/${mine.booking.id}/confirm`, {})).status, 404);
    assert.equal((await k.c.post(`/api/bookings/${mine.booking.id}/confirm`, {})).status, 403);

    const confirmed = await p.post(`/api/bookings/${mine.booking.id}/confirm`, {});
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.status, "booked");
    const again = await p.post(`/api/bookings/${mine.booking.id}/confirm`, {});
    assert.equal(again.status, 409);
    assert.equal(code(again), "HOLD_EXPIRED");

    const detail = (await k.c.get(`/api/leads/${leadId}`)).body;
    assert.equal(detail.status, "booked");
    assert.equal(detail.booking.status, "booked");
    assert.equal(detail.booking.contact.phone, "+45 12 34 56 78");
  });

  it("en optaget tid kan ikke foreslås (409 SLOT_TAKEN), og et almindeligt lead kan ikke få en tid", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const p1 = await patient();
    const p2 = await patient();
    const one = await p1.post("/api/emergency-leads", body(k, emergency));
    const two = await p2.post("/api/emergency-leads", body(k, emergency));
    const [slot] = await slots(k, one.body.lead.id, emergency);
    assert.equal((await k.c.post(`/api/leads/${one.body.lead.id}/decision`, { decision: "accept", proposedStartsAt: slot.startsAt })).status, 200);
    const taken = await k.c.post(`/api/leads/${two.body.lead.id}/decision`, { decision: "accept", proposedStartsAt: slot.startsAt });
    assert.equal(taken.status, 409);
    assert.equal(code(taken), "SLOT_TAKEN");
    const free = await slots(k, two.body.lead.id, emergency);
    assert.ok(!free.some((s) => s.startsAt === slot.startsAt), "den foreslåede tid er ikke længere ledig");
    const declined = await k.c.post(`/api/leads/${two.body.lead.id}/decision`, { decision: "decline", reason: "no_capacity" });
    assert.equal(declined.status, 200, JSON.stringify(declined.body));
    assert.equal(declined.body.booking, null);
  });

  it("kræver login og vilkår", async () => {
    const { emergency } = await services;
    const k = await clinic();
    const noLogin = await newClientWithTerms();
    assert.equal((await noLogin.post("/api/emergency-leads", body(k, emergency))).status, 401);
    assert.equal((await k.c.post("/api/emergency-leads", body(k, emergency))).status, 403);
  });
});
