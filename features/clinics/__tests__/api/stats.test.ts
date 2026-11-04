// API-tests for klinikkens statistik (clinics 10.18; RLS-punkt 59). Fiktive klinikker og patienter, ryddes til sidst.
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
type Patient = { c: TestClient; caseId: string; userId: string; email: string; serviceId: string };

async function clinic(status: "verified" | "registered" = "verified"): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Statistiktest Tandklinik",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const id = (await c.get("/api/me")).body.clinic.id as string;
  assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: status })).error);
  return { c, id };
}

async function patient(): Promise<Patient> {
  const c = await newClientWithTerms();
  const email = uniqueEmail();
  const s = await c.post("/api/auth/signup", { role: "patient", email, password: PASSWORD, firstName: "Lea" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  const caseId = (await c.post("/api/cases")).body.id as string;
  const serviceId = (await c.get("/api/services")).body.groups[0].services[0].id as string;
  assert.equal((await c.put(`/api/cases/${caseId}/services`, { services: [{ serviceId, suggestedByAi: false }] })).status, 200);
  assert.equal((await c.patch(`/api/cases/${caseId}`, { postalCode: "2100", preferredTimeframe: "flexible" })).status, 200);
  assert.equal((await c.put(`/api/cases/${caseId}/summary`, { summaryText: "Jeg vil gerne have en tjekup." })).status, 200);
  assert.equal((await c.post("/api/consents", { type: "health_data_sharing", textVersion: SHARING_CONSENT_VERSION })).status, 201);
  return { c, caseId, userId: s.body.userId, email, serviceId };
}

async function sendLead(k: Clinic): Promise<{ p: Patient; leadId: string }> {
  const p = await patient();
  const sent = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [k.id] });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  return { p, leadId: sent.body.leads[0].id as string };
}

const code = (r: { body: unknown }) => (r.body as { error?: { code: string } }).error?.code;

describe("klinikkens statistik", () => {
  it("tal efter et kendt forløb: to leads, én accept, én afvisning og én gennemført booking", async () => {
    const k = await clinic();
    const empty = await k.c.get("/api/clinics/me/stats");
    assert.equal(empty.status, 200);
    assert.equal(empty.body.period.days, 30);
    assert.equal(empty.body.leads.total, 0);
    assert.equal(empty.body.acceptRatePct, null);
    assert.equal(empty.body.response.medianMinutes, null);
    assert.equal(empty.body.leadToBookingPct, null);

    const a = await sendLead(k);
    const b = await sendLead(k);
    assert.equal((await k.c.post(`/api/leads/${a.leadId}/decision`, { decision: "accept" })).status, 200);
    assert.equal((await k.c.post(`/api/leads/${b.leadId}/decision`, { decision: "decline", reason: "other" })).status, 200);
    const starts = new Date(Math.floor((Date.now() - 30 * 3_600_000) / 900_000) * 900_000);
    assert.ifError(
      (
        await admin.from("bookings").insert({
          lead_id: a.leadId,
          clinic_id: k.id,
          patient_id: a.p.userId,
          service_id: a.p.serviceId,
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + 30 * 60_000).toISOString(),
          status: "booked",
          contact_name: "Lea Testesen",
          contact_phone: "+45 12 34 56 78",
          contact_email: a.p.email,
        })
      ).error,
    );

    const r = await k.c.get("/api/clinics/me/stats?days=90");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.period.days, 90);
    assert.deepEqual(r.body.leads, { total: 2, pending: 0, accepted: 1, declined: 1, withdrawnUnanswered: 0, emergency: 0 });
    assert.equal(r.body.acceptRatePct, 50);
    assert.equal(r.body.response.within24hPct, 100);
    assert.equal(typeof r.body.response.medianMinutes, "number");
    assert.equal(r.body.bookings.completed, 1);
    assert.equal(r.body.bookings.upcoming, 0);
    assert.equal(r.body.leadToBookingPct, 50);
    // Kun tal: ingen id'er eller indhold.
    assert.doesNotMatch(JSON.stringify(r.body), new RegExp(`${a.p.userId}|${a.leadId}|Lea`));
  });

  it("ugyldig periode giver 400, og en anden klinik ser 0", async () => {
    const x = await clinic();
    const y = await clinic();
    await sendLead(x);
    const bad = await x.c.get("/api/clinics/me/stats?days=7");
    assert.equal(bad.status, 400);
    assert.equal(code(bad), "VALIDATION_ERROR");
    assert.equal((await x.c.get("/api/clinics/me/stats")).body.leads.pending, 1);
    assert.equal((await y.c.get("/api/clinics/me/stats")).body.leads.total, 0);
  });

  it("afviser patient, anonym, ikke-verificeret klinik og uden session", async () => {
    const p = await patient();
    assert.equal((await p.c.get("/api/clinics/me/stats")).status, 403);
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    assert.equal((await anon.get("/api/clinics/me/stats")).status, 403);
    const r = await clinic("registered");
    const res = await r.c.get("/api/clinics/me/stats");
    assert.equal(res.status, 403);
    assert.equal(code(res), "CLINIC_NOT_VERIFIED");
    const none = await newClientWithTerms();
    assert.equal((await none.get("/api/clinics/me/stats")).status, 401);
  });
});
