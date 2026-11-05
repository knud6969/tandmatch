// API-tests for klokken (platform 14.11) og patientens e-mail og SMS om bookinger (platform 14.12, identity 10.20)
// (NOTIFICATIONS_FAKE=1, ingen netværkskald).
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
} from "../../../tests/api/helpers.ts";

assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^http:\/\/(127\.0\.0\.1|localhost):/, "kun lokal Supabase");

const admin = adminClient();
const createdUserIds = new Set<string>();
after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

const CRON = { authorization: `Bearer ${process.env.CRON_SECRET}` };

type Clinic = { c: TestClient; id: string; userId: string };
type Patient = { c: TestClient; caseId: string; userId: string; email: string; serviceId: string };
type Item = { id: string; type: string; title: string; body: string | null; path: string; readAt: string | null; createdAt: string };
type Inbox = { items: Item[]; unreadCount: number };

async function clinic(): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", { role: "clinic", email: uniqueEmail("klinik"), password: PASSWORD, cvr: randomCvr(), clinicName: "Klokkeklinik ApS", address: "Testvej 1", postalCode: "2100", city: "København Ø", phone: "00 00 00 01" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const id = (await c.get("/api/me")).body.clinic.id as string;
  assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "verified" })).error);
  const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ clinic_id: id, weekday, opens_at: "06:00", closes_at: "22:00", is_emergency: false }));
  assert.ifError((await admin.from("clinic_opening_hours").insert(hours)).error);
  return { c, id, userId: r.body.userId };
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

async function sendLead(p: Patient, k: Clinic): Promise<string> {
  const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [k.id] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.leads[0].id as string;
}

async function book(p: Patient, leadId: string): Promise<string> {
  const slots = await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`);
  assert.equal(slots.status, 200);
  const booked = await p.c.post(`/api/leads/${leadId}/booking`, { serviceId: p.serviceId, startsAt: slots.body.slots[0].startsAt, contactName: "Lea Testesen", contactPhone: "+45 12 34 56 78" });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  return booked.body.id as string;
}

const inbox = async (c: TestClient): Promise<Inbox> => {
  const r = await c.get("/api/notifications");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as Inbox;
};

type Row = { id: string; type: string; channel: string; status: string; last_error: string | null; payload: Record<string, string> };
async function outbox(userId: string): Promise<Row[]> {
  const { data, error } = await admin.from("notification_outbox").select("id, type, channel, status, last_error, payload").eq("recipient_user_id", userId).order("created_at");
  assert.ifError(error);
  return (data ?? []) as Row[];
}
async function settled(userId: string, type: string, channel: string): Promise<Row> {
  for (let i = 0; i < 40; i += 1) {
    const row = (await outbox(userId)).find((r) => r.type === type && r.channel === channel);
    if (row && row.status !== "pending" && row.status !== "sending") return row;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`rækken ${type}/${channel} blev ikke afsendt`);
}

describe("GET /api/notifications og POST /api/notifications/read", () => {
  it("kræver login og konto: 401 uden session, 403 for anonym", async () => {
    assert.equal((await (await newClientWithTerms()).get("/api/notifications")).status, 401);
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    assert.equal((await anon.get("/api/notifications")).status, 403);
    assert.equal((await anon.post("/api/notifications/read", {})).status, 403);
  });

  it("klinikken får et nyt lead i klokken uanset e-mail- og push-valg, og tryk-stien er leadet", async () => {
    const k = await clinic();
    const settings = { emailNewLead: false, emailNewMessage: false, emailBookingChanges: false, emailBookingReminder: false, webPushNewLead: false, webPushNewMessage: false, webPushBookingChanges: false, webPushBookingReminder: false };
    assert.equal((await k.c.put("/api/clinics/me/notification-settings", settings)).status, 200);
    assert.deepEqual(await inbox(k.c), { items: [], unreadCount: 0 });
    const p = await patient();
    const leadId = await sendLead(p, k);
    const { items, unreadCount } = await inbox(k.c);
    assert.equal(unreadCount, 1);
    assert.equal(items.length, 1);
    assert.deepEqual({ type: items[0].type, title: items[0].title, body: items[0].body, path: items[0].path, readAt: items[0].readAt }, { type: "clinic_new_lead", title: "Ny henvendelse på TandMatch", body: null, path: `/klinik/lead/${leadId}`, readAt: null });
    // Intet andet end de faste felter; ingen id'er, navne eller tekster ud over stien.
    assert.deepEqual(Object.keys(items[0]).sort(), ["body", "createdAt", "id", "path", "readAt", "title", "type"]);
    // Patienten ser ikke klinikkens notifikation.
    assert.deepEqual(await inbox(p.c), { items: [], unreadCount: 0 });
  });

  it("marker som læst: de angivne, fremmede id'er ændrer intet, og 'alle' tømmer tallet", async () => {
    const k1 = await clinic();
    const k2 = await clinic();
    const p = await patient();
    await sendLead(p, k1);
    const p2 = await patient();
    await sendLead(p2, k2);
    const mine = (await inbox(k1.c)).items[0];
    const theirs = (await inbox(k2.c)).items[0];
    // k2 forsøger at markere k1's: 204, men intet sker.
    assert.equal((await k2.c.post("/api/notifications/read", { ids: [mine.id] })).status, 204);
    assert.equal((await inbox(k1.c)).unreadCount, 1);
    assert.equal((await inbox(k2.c)).unreadCount, 1);
    assert.equal((await k1.c.post("/api/notifications/read", { ids: [mine.id] })).status, 204);
    const after1 = await inbox(k1.c);
    assert.equal(after1.unreadCount, 0);
    assert.ok(after1.items[0].readAt);
    assert.equal((await k2.c.post("/api/notifications/read", {})).status, 204);
    assert.equal((await inbox(k2.c)).unreadCount, 0);
    assert.equal((await inbox(k2.c)).items[0].id, theirs.id);
    // Validering.
    assert.equal((await k1.c.post("/api/notifications/read", { ids: [] })).status, 400);
    assert.equal((await k1.c.post("/api/notifications/read", { ids: ["ikke-et-id"] })).status, 400);
    assert.equal((await k1.c.post("/api/notifications/read", { ids: Array.from({ length: 101 }, () => mine.id) })).status, 400);
    assert.equal((await k1.c.post("/api/notifications/read", { all: true })).status, 400);
  });

  it("patientens klokke: svar, booking og aflysning; ingen persondata i teksterne", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sendLead(p, k);
    assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 200);
    let mine = await inbox(p.c);
    assert.equal(mine.items[0].type, "patient_lead_answered");
    assert.equal(mine.items[0].title, "Klinikken har svaret på din henvendelse.");
    assert.equal(mine.items[0].path, `/sag/${p.caseId}`);
    const bookingId = await book(p, leadId);
    mine = await inbox(p.c);
    const created = mine.items.find((i) => i.type === "patient_booking_created");
    assert.ok(created, "din tid er booket");
    assert.equal(created.path, "/bookinger");
    assert.match(created.body ?? "", /kl\. \d\d\.\d\d\.$/);
    assert.equal((await k.c.post(`/api/bookings/${bookingId}/cancel`, { reason: "Sygdom hos tandlægen" })).status, 200);
    mine = await inbox(p.c);
    assert.ok(mine.items.some((i) => i.type === "patient_booking_cancelled"));
    assert.equal(mine.unreadCount, 3);
    const dump = JSON.stringify(mine) + JSON.stringify(await inbox(k.c));
    for (const secret of ["Lea", "Testesen", "12 34 56 78", "tjekup", "Sygdom", p.email]) assert.ok(!dump.includes(secret), `klokken må ikke indeholde ${secret}`);
    // Klinikken ser: nyt lead og ny booking, men ikke patientens notifikationer.
    const clinicTypes = (await inbox(k.c)).items.map((i) => i.type).sort();
    assert.deepEqual(clinicTypes, ["clinic_booking_created", "clinic_new_lead"]);
  });
});

describe("patientens e-mail og SMS", () => {
  it("GET/PUT notification-contact: tomt som standard, gem, ret, ryd og valider", async () => {
    const p = await patient();
    assert.deepEqual((await p.c.get("/api/patients/me/notification-contact")).body, { email: null, phone: null });
    const put = await p.c.put("/api/patients/me/notification-contact", { email: " lea@example.com ", phone: "+45 12 34 56 78" });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.deepEqual(put.body, { email: "lea@example.com", phone: "+45 12 34 56 78" });
    assert.deepEqual((await p.c.get("/api/patients/me/notification-contact")).body, { email: "lea@example.com", phone: "+45 12 34 56 78" });
    assert.equal((await p.c.put("/api/patients/me/notification-contact", { email: null, phone: "+45 87 65 43 21" })).body.email, null);
    assert.equal((await p.c.put("/api/patients/me/notification-contact", { email: "ikke-en-mail", phone: null })).status, 400);
    assert.equal((await p.c.put("/api/patients/me/notification-contact", { email: null, phone: "123" })).status, 400);
    assert.equal((await p.c.put("/api/patients/me/notification-contact", { email: null })).status, 400);
    assert.deepEqual((await p.c.put("/api/patients/me/notification-contact", { email: null, phone: null })).body, { email: null, phone: null });
    // Dataeksport og sletning.
    await p.c.put("/api/patients/me/notification-contact", { email: "lea@example.com", phone: null });
    const exported = await p.c.get("/api/patients/me/export");
    assert.equal(exported.status, 200);
    assert.equal(exported.body.notificationContact.email, "lea@example.com");
  });

  it("anonym og klinik har ingen adgang, og klinikken kan ikke læse tabellen", async () => {
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    assert.equal((await anon.get("/api/patients/me/notification-contact")).status, 403);
    assert.equal((await anon.put("/api/patients/me/notification-contact", { email: null, phone: null })).status, 403);
    const k = await clinic();
    assert.equal((await k.c.get("/api/patients/me/notification-contact")).status, 403);
    assert.equal((await (await newClientWithTerms()).get("/api/patients/me/notification-contact")).status, 401);
  });

  it("booking giver e-mail og SMS til patienten (kun e-mail uden nummer), uden persondata i outboxen", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sendLead(p, k);
    assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 200);
    await book(p, leadId);
    const mail = await settled(p.userId, "patient_booking_created", "email");
    assert.equal(mail.status, "sent", mail.last_error ?? "");
    const sms = await settled(p.userId, "patient_booking_created", "sms");
    assert.equal(sms.status, "skipped", "intet nummer valgt");
    assert.equal(sms.last_error, "NO_RECIPIENT");
    assert.deepEqual(Object.keys(mail.payload).sort(), ["bookingId", "startsAt"]);
    // Svar på henvendelse giver kun push (ingen token her), aldrig e-mail eller SMS.
    const rows = await outbox(p.userId);
    assert.deepEqual(rows.filter((r) => r.type === "patient_lead_answered").map((r) => r.channel), ["push"]);
    const dump = JSON.stringify(rows);
    for (const secret of [p.email, "12 34 56 78", "Testesen", "Lea"]) assert.ok(!dump.includes(secret), `outboxen må ikke indeholde ${secret}`);
  });

  it("med et valgt nummer sendes SMS'en; en klinikaflysning giver push, e-mail og SMS", async () => {
    const k = await clinic();
    const p = await patient();
    assert.equal((await p.c.put("/api/patients/me/notification-contact", { email: null, phone: "+45 87 65 43 21" })).status, 200);
    const leadId = await sendLead(p, k);
    assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 200);
    const bookingId = await book(p, leadId);
    const sms = await settled(p.userId, "patient_booking_created", "sms");
    assert.equal(sms.status, "sent", sms.last_error ?? "");
    assert.equal((await k.c.post(`/api/bookings/${bookingId}/cancel`, { reason: "Sygdom" })).status, 200);
    for (const channel of ["push", "email", "sms"]) {
      const row = await settled(p.userId, "patient_booking_cancelled", channel);
      assert.ok(["sent", "skipped"].includes(row.status), `${channel}: ${row.status}`);
    }
    assert.equal((await settled(p.userId, "patient_booking_cancelled", "sms")).status, "sent");
  });

  it("patientens egen aflysning giver e-mail og SMS, men ingen push", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sendLead(p, k);
    assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 200);
    const bookingId = await book(p, leadId);
    assert.equal((await p.c.post(`/api/bookings/${bookingId}/cancel`, {})).status, 200);
    await settled(p.userId, "patient_booking_cancelled_self", "email");
    await settled(p.userId, "patient_booking_cancelled_self", "sms");
    const rows = await outbox(p.userId);
    assert.equal(rows.filter((r) => r.type === "patient_booking_cancelled_self" && r.channel === "push").length, 0);
    const forbidden = rows.filter((r) => ["email", "sms"].includes(r.channel) && ["patient_lead_answered", "patient_new_message"].includes(r.type));
    assert.equal(forbidden.length, 0, "svar og beskeder går aldrig som e-mail eller SMS");
  });
});

describe("påmindelser", () => {
  it("booking-reminders svarer også med antal anmeldelsespåmindelser og kræver stadig CRON_SECRET", async () => {
    const c = new TestClient();
    assert.equal((await c.post("/api/cron/booking-reminders")).status, 401);
    const r = await c.post("/api/cron/booking-reminders", {}, CRON);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ["enqueued", "failed", "retried", "reviewReminders", "sent", "skipped"]);
  });
});
