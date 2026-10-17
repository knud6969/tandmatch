// API-tests for trin 4.1: afsendelse og tilbagetrækning af leads (architecture 5.3, 10.5, 10.9).
// Kører mod en rigtig app + lokal Supabase. Klinikker og patienter er fiktive og ryddes til sidst.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD,
  SHARING_CONSENT_VERSION,
  TestClient,
  adminClient,
  newClientWithTerms,
  randomCvr,
  uniqueEmail,
} from "./helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type Patient = { c: TestClient; caseId: string; userId: string };

// Verificeret (eller kun oprettet) klinik; returnerer klinikkens id.
async function clinic(verified = true): Promise<string> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Leadtest Tandklinik",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const me = await c.get("/api/me");
  const clinicId = me.body.clinic.id as string;
  if (verified) {
    const { error } = await admin.rpc("admin_set_clinic_status", { p_clinic_id: clinicId, p_status: "verified" });
    assert.ifError(error);
  }
  return clinicId;
}

async function clinics(count: number): Promise<string[]> {
  return Promise.all(Array.from({ length: count }, () => clinic()));
}

// Patient med konto og en sag. `ready` = ydelse, postnummer, tidsrum, godkendt opsummering og delingssamtykke.
async function patient(ready = true): Promise<Patient> {
  const c = await newClientWithTerms();
  const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Lea" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  const created = await c.post("/api/cases");
  assert.equal(created.status, 201);
  const caseId = created.body.id as string;
  if (ready) {
    const catalog = await c.get("/api/services");
    const serviceId = catalog.body.groups[0].services[0].id as string;
    assert.equal((await c.put(`/api/cases/${caseId}/services`, { services: [{ serviceId, suggestedByAi: false }] })).status, 200);
    assert.equal((await c.patch(`/api/cases/${caseId}`, { postalCode: "2100", preferredTimeframe: "flexible" })).status, 200);
    assert.equal((await c.put(`/api/cases/${caseId}/summary`, { summaryText: "Jeg vil gerne have en tjekup." })).status, 200);
    const consent = await c.post("/api/consents", { type: "health_data_sharing", textVersion: SHARING_CONSENT_VERSION });
    assert.equal(consent.status, 201);
  }
  return { c, caseId, userId: s.body.userId };
}

function errorOf(r: { body: { error?: { code: string } } }) {
  return r.body.error?.code;
}

describe("send leads", () => {
  it("sender til tre klinikker og returnerer tre leads med klinikkens navn", async () => {
    const p = await patient();
    const ids = await clinics(3);
    const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: ids });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.leads.length, 3);
    for (const lead of r.body.leads) {
      assert.equal(lead.status, "sent");
      assert.equal(lead.clinic.name, "Leadtest Tandklinik");
      assert.equal(lead.clinic.city, "København Ø");
      assert.equal(lead.clinic.removed, false);
      assert.equal(lead.booking, null);
      assert.equal(lead.unreadMessages, 0);
      assert.ok(ids.includes(lead.clinic.id));
    }
    const sag = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(sag.body.status, "submitted");
    assert.equal(sag.body.leadCount, 3);
    assert.equal(sag.body.canSend, false);
  });

  it("afviser et fjerde aktivt lead (LEAD_LIMIT)", async () => {
    const p = await patient();
    const ids = await clinics(4);
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: ids.slice(0, 3) })).status, 201);
    const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [ids[3]] });
    assert.equal(r.status, 409);
    assert.equal(errorOf(r), "LEAD_LIMIT");
    // Mere end tre på én gang afvises af skemaet
    const four = await (await patient()).c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: ids });
    assert.equal(four.status, 400);
  });

  it("afviser den samme klinik igen (CLINIC_ALREADY_CONTACTED)", async () => {
    const p = await patient();
    const [a] = await clinics(1);
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a] })).status, 201);
    const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a] });
    assert.equal(r.status, 409);
    assert.equal(errorOf(r), "CLINIC_ALREADY_CONTACTED");
  });

  it("afviser en klinik, der ikke er verificeret (CLINIC_NOT_AVAILABLE)", async () => {
    const p = await patient();
    const unverified = await clinic(false);
    const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [unverified] });
    assert.equal(r.status, 409);
    assert.equal(errorOf(r), "CLINIC_NOT_AVAILABLE");
    const ghost = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: ["00000000-0000-4000-8000-000000000000"] });
    assert.equal(ghost.status, 409);
    assert.equal(errorOf(ghost), "CLINIC_NOT_AVAILABLE");
  });

  it("kræver konto (ACCOUNT_REQUIRED) for anonyme", async () => {
    const c = await newClientWithTerms();
    const anon = await c.startAnonymous();
    assert.equal(anon.status, 201);
    createdUserIds.add((await c.get("/api/me")).body.id);
    const [a] = await clinics(1);
    const r = await c.post(`/api/cases/${anon.body.caseId}/leads`, { clinicIds: [a] });
    assert.equal(r.status, 403);
    assert.equal(errorOf(r), "ACCOUNT_REQUIRED");
    const w = await c.post("/api/leads/00000000-0000-4000-8000-000000000000/withdraw");
    assert.equal(w.status, 403);
    assert.equal(errorOf(w), "ACCOUNT_REQUIRED");
    // Uden login overhovedet
    const loggedOut = await newClientWithTerms();
    assert.equal((await loggedOut.post(`/api/cases/${anon.body.caseId}/leads`, { clinicIds: [a] })).status, 401);
  });

  it("afviser en sag uden godkendt opsummering (CASE_NOT_READY)", async () => {
    const p = await patient(false);
    const [a] = await clinics(1);
    const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a] });
    assert.equal(r.status, 409);
    assert.equal(errorOf(r), "CASE_NOT_READY");
  });

  it("kræver samtykke til deling (CONSENT_REQUIRED)", async () => {
    const p = await patient();
    const consents = await p.c.get("/api/consents");
    const sharing = (consents.body.consents ?? consents.body).find((x: { type: string }) => x.type === "health_data_sharing");
    assert.ok(sharing);
    // Træk samtykket tilbage via databasen (ingen leads endnu, så intet andet ændres)
    const { error } = await admin.from("consents").update({ withdrawn_at: new Date().toISOString() }).eq("id", sharing.id);
    assert.ifError(error);
    const [a] = await clinics(1);
    const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a] });
    assert.equal(r.status, 403);
    assert.equal(errorOf(r), "CONSENT_REQUIRED");
  });

  it("validerer input og skjuler andres sager", async () => {
    const p = await patient();
    const other = await patient();
    const [a] = await clinics(1);
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [] })).status, 400);
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: ["x"] })).status, 400);
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a, a] })).status, 400);
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a], extra: 1 })).status, 400);
    assert.equal((await other.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a] })).status, 404);
    assert.equal((await other.c.get(`/api/cases/${p.caseId}/leads`)).status, 404);
  });
});

describe("tilbagetræk lead", () => {
  it("trækker et ubesvaret lead tilbage og kan derefter sende til en ny klinik", async () => {
    const p = await patient();
    const ids = await clinics(4);
    const sent = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: ids.slice(0, 3) });
    assert.equal(sent.status, 201);
    const target = sent.body.leads.find((l: { clinic: { id: string } }) => l.clinic.id === ids[0]);
    const w = await p.c.post(`/api/leads/${target.id}/withdraw`);
    assert.equal(w.status, 200, JSON.stringify(w.body));
    assert.equal(w.body.status, "withdrawn");
    assert.equal(w.body.clinic.name, "Leadtest Tandklinik");

    const next = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [ids[3]] });
    assert.equal(next.status, 201, JSON.stringify(next.body));
    // Samme klinik kan ikke få sagen igen, selv efter tilbagetrækning
    const again = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [ids[0]] });
    assert.equal(again.status, 409);
    assert.equal(errorOf(again), "CLINIC_ALREADY_CONTACTED");
    // Og nu er de tre aktive pladser fyldt igen
    const [extra] = await clinics(1);
    assert.equal(errorOf(await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [extra] })), "LEAD_LIMIT");
  });

  it("afviser tilbagetrækning af et besvaret lead", async () => {
    const p = await patient();
    const [a] = await clinics(1);
    const sent = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a] });
    const leadId = sent.body.leads[0].id as string;
    const { error } = await admin.from("leads").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", leadId);
    assert.ifError(error);
    const r = await p.c.post(`/api/leads/${leadId}/withdraw`);
    assert.equal(r.status, 409);
    assert.equal(errorOf(r), "LEAD_NOT_PENDING");
  });

  it("andre patienter kan ikke trække tilbage", async () => {
    const p = await patient();
    const other = await patient();
    const [a] = await clinics(1);
    const sent = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [a] });
    const r = await other.c.post(`/api/leads/${sent.body.leads[0].id}/withdraw`);
    assert.equal(r.status, 404);
    assert.equal((await p.c.get(`/api/cases/${p.caseId}/leads`)).body.leads[0].status, "sent");
  });
});

describe("læs leads, sagsoversigt og eksport", () => {
  it("GET leads viser egne leads; sagsoversigten har klinikkens navn; eksporten har leads", async () => {
    const p = await patient();
    const ids = await clinics(2);
    assert.equal((await p.c.get(`/api/cases/${p.caseId}/leads`)).body.leads.length, 0);
    await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: ids });

    const list = await p.c.get(`/api/cases/${p.caseId}/leads`);
    assert.equal(list.status, 200);
    assert.equal(list.body.leads.length, 2);
    assert.deepEqual(list.body.leads.map((l: { clinic: { id: string } }) => l.clinic.id).sort(), [...ids].sort());

    const cases = await p.c.get("/api/cases");
    const mine = cases.body.cases.find((c: { id: string }) => c.id === p.caseId);
    assert.equal(mine.leads.length, 2);
    for (const l of mine.leads) assert.equal(l.clinicName, "Leadtest Tandklinik");

    const exported = await p.c.get("/api/patients/me/export");
    assert.equal(exported.status, 200);
    assert.equal(exported.body.leads.length, 2);
    assert.equal(exported.body.leads[0].caseId, p.caseId);
    assert.ok(exported.body.leads[0].clinicName);
    assert.ok("cases" in exported.body && "chat" in exported.body && "consents" in exported.body);
  });

  it("en fjernet klinik ses stadig på patientens lead", async () => {
    const p = await patient();
    const c = await newClientWithTerms();
    const s = await c.post("/api/auth/signup", {
      role: "clinic", email: uniqueEmail("klinik"), password: PASSWORD, cvr: randomCvr(), clinicName: "Forsvindende Klinik",
      address: "Testvej 2", postalCode: "2100", city: "København Ø", phone: "00 00 00 03",
    });
    assert.equal(s.status, 201);
    const clinicId = (await c.get("/api/me")).body.clinic.id as string;
    assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: clinicId, p_status: "verified" })).error);
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [clinicId] })).status, 201);
    // Klinikkens konto slettes (selvoprettet klinik bliver removed)
    assert.ifError((await admin.auth.admin.deleteUser(s.body.userId)).error);
    const r = await p.c.get(`/api/cases/${p.caseId}/leads`);
    assert.equal(r.body.leads[0].clinic.name, "Forsvindende Klinik");
    assert.equal(r.body.leads[0].clinic.removed, true);
    assert.equal(r.body.leads[0].clinic.logoUrl, null);
  });
});
