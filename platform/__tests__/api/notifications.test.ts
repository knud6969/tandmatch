// API-tests for notifikationer (platform 14): outboxen fyldes af databasen, afsendelsen sker efter svaret og af cron-routerne
// (NOTIFICATIONS_FAKE=1, ingen netværkskald), påmindelser er idempotente, og klinikkens valg respekteres.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_URL,
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

const HOUR = 3_600_000;
const MINUTE = 60_000;
const CRON = { authorization: `Bearer ${process.env.CRON_SECRET}` };
const ALLOWED_PAYLOAD_KEYS = ["caseId", "leadId", "bookingId", "startsAt", "previousStartsAt", "holdExpiresAt"];

type Clinic = { c: TestClient; id: string; userId: string };
type Patient = { c: TestClient; caseId: string; userId: string; email: string; serviceId: string; token: string };

async function clinic(): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", { role: "clinic", email: uniqueEmail("klinik"), password: PASSWORD, cvr: randomCvr(), clinicName: "Notifikationsklinik ApS", address: "Testvej 1", postalCode: "2100", city: "København Ø", phone: "00 00 00 01" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const id = (await c.get("/api/me")).body.clinic.id as string;
  assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "verified" })).error);
  const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ clinic_id: id, weekday, opens_at: "06:00", closes_at: "22:00", is_emergency: false }));
  assert.ifError((await admin.from("clinic_opening_hours").insert(hours)).error);
  return { c, id, userId: r.body.userId };
}

// Patient med konto, en sendeklar sag og et registreret push-token.
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
  const token = `ExponentPushToken[${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}]`;
  assert.equal((await c.put("/api/push-tokens", { token, platform: "ios" })).status, 204);
  return { c, caseId, userId: s.body.userId, email, serviceId, token };
}

type Row = { id: string; type: string; channel: string; status: string; payload: Record<string, string>; last_error: string | null; dedup_key: string | null };

async function outbox(filter: { lead?: string; booking?: string; clinic?: string; user?: string }): Promise<Row[]> {
  let q = admin.from("notification_outbox").select("id, type, channel, status, payload, last_error, dedup_key").order("created_at");
  if (filter.lead) q = q.eq("lead_id", filter.lead);
  if (filter.booking) q = q.eq("booking_id", filter.booking);
  if (filter.clinic) q = q.eq("clinic_id", filter.clinic);
  if (filter.user) q = q.eq("recipient_user_id", filter.user);
  const { data, error } = await q;
  assert.ifError(error);
  return (data ?? []) as Row[];
}

const find = (rows: Row[], type: string, channel?: string) => rows.filter((r) => r.type === type && (channel === undefined || r.channel === channel));

// Afsendelsen sker efter svaret (after()) og af cron: vent, til rækken ikke længere venter.
async function settled(filter: Parameters<typeof outbox>[0], type: string, channel: string): Promise<Row> {
  for (let i = 0; i < 40; i += 1) {
    const row = find(await outbox(filter), type, channel)[0];
    if (row && row.status !== "pending" && row.status !== "sending") return row;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`rækken ${type}/${channel} blev ikke afsendt`);
}

const runCron = () => new TestClient().post("/api/cron/notifications", {}, CRON);

async function sentLead(p: Patient, k: Clinic): Promise<string> {
  const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [k.id] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.leads[0].id as string;
}

describe("cron-routerne", () => {
  for (const url of ["/api/cron/notifications", "/api/cron/booking-reminders"]) {
    it(`${url}: 401 uden gyldig hemmelighed, for GET og POST`, async () => {
      const c = new TestClient();
      assert.equal((await c.post(url)).status, 401);
      assert.equal((await c.post(url, {}, { authorization: "Bearer forkert-forkert-forkert" })).status, 401);
      assert.equal((await fetch(BASE_URL + url)).status, 401);
      assert.equal((await c.post(url)).body.error.code, "UNAUTHORIZED");
    });
  }

  it("notifications: 200 med tællerne og uden vilkårs-cookie", async () => {
    const r = await runCron();
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ["failed", "purged", "retried", "sent", "skipped"]);
    const get = await fetch(BASE_URL + "/api/cron/notifications", { headers: CRON });
    assert.equal(get.status, 200);
  });
});

describe("outboxen gennem API'et", () => {
  it("lead, besvarelse, booking og aflysning giver de forventede rækker, som sendes uden at cron kører", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sentLead(p, k);

    // Nyt lead: e-mail til klinikken, afsendt efter svaret (uden cron).
    const lead = await settled({ lead: leadId }, "clinic_new_lead", "email");
    assert.equal(lead.status, "sent", lead.last_error ?? "");
    assert.deepEqual(lead.payload, { leadId });
    assert.equal(lead.dedup_key, `clinic_new_lead:${leadId}`);

    // Klinikken accepterer: push til patienten (har et token).
    assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 200);
    const answered = await settled({ lead: leadId }, "patient_lead_answered", "push");
    assert.equal(answered.status, "sent", answered.last_error ?? "");
    assert.deepEqual(Object.keys(answered.payload).sort(), ["caseId", "leadId"]);

    // Patienten skriver, booker og aflyser.
    assert.equal((await p.c.post(`/api/leads/${leadId}/messages`, { body: "Hej, jeg har et spørgsmål." })).status, 201);
    const slots = await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`);
    assert.equal(slots.status, 200);
    const startsAt = slots.body.slots[0].startsAt as string;
    const booked = await p.c.post(`/api/leads/${leadId}/booking`, { serviceId: p.serviceId, startsAt, contactName: "Lea Testesen", contactPhone: "+45 12 34 56 78" });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    const bookingId = booked.body.id as string;
    assert.equal((await p.c.post(`/api/bookings/${bookingId}/cancel`, {})).status, 200);

    // Cron er sikkerhedsnettet: efter et kald er alt afsluttet.
    assert.equal((await runCron()).status, 200);
    const rows = await outbox({ lead: leadId });
    for (const type of ["clinic_new_lead", "clinic_new_message", "clinic_booking_created", "clinic_booking_cancelled"]) {
      const row = find(rows, type, "email")[0];
      assert.ok(row, `mangler ${type}`);
      assert.equal(row.status, "sent", `${type}: ${row.last_error}`);
    }
    assert.equal(find(rows, "clinic_booking_cancelled").length, 1);
    assert.equal(find(rows, "patient_booking_cancelled").length, 0, "patientens egen aflysning giver ingen push til patienten");

    // Payload: kun id'er og tidspunkter. Ingen navne, telefon, beskedtekst eller opsummering.
    for (const row of rows) {
      assert.ok(Object.keys(row.payload).every((key) => ALLOWED_PAYLOAD_KEYS.includes(key)), JSON.stringify(row.payload));
    }
    const dump = JSON.stringify(rows);
    for (const secret of ["Lea", "Testesen", "12 34 56 78", "spørgsmål", "tjekup", p.email, p.token]) {
      assert.ok(!dump.includes(secret), `outboxen må ikke indeholde ${secret}`);
    }
  });

  it("klinikkens aflysning giver push til patienten", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sentLead(p, k);
    await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
    const slots = await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`);
    const booked = await p.c.post(`/api/leads/${leadId}/booking`, { serviceId: p.serviceId, startsAt: slots.body.slots[0].startsAt, contactName: "Lea Testesen", contactPhone: "+45 12 34 56 78" });
    assert.equal(booked.status, 201);
    assert.equal((await k.c.post(`/api/bookings/${booked.body.id}/cancel`, { reason: "Sygdom hos tandlægen" })).status, 200);
    const row = await settled({ booking: booked.body.id }, "patient_booking_cancelled", "push");
    assert.equal(row.status, "sent", row.last_error ?? "");
    assert.deepEqual(row.payload, { bookingId: booked.body.id });
    assert.ok(!JSON.stringify(await outbox({ lead: leadId })).includes("Sygdom"), "årsagen står ikke i outboxen");
  });

  it("uden push-token springes patientens push over (skipped), og tokenet afmeldes ved DELETE", async () => {
    const k = await clinic();
    const p = await patient();
    assert.equal((await p.c.del("/api/push-tokens", { token: p.token })).status, 204);
    const leadId = await sentLead(p, k);
    await k.c.post(`/api/leads/${leadId}/decision`, { decision: "decline", reason: "no_capacity" });
    const row = await settled({ lead: leadId }, "patient_lead_answered", "push");
    assert.equal(row.status, "skipped");
    assert.equal(row.last_error, "NO_RECIPIENT");
  });

  it("en klinik, der har slået email_new_lead fra, får ingen e-mailrække", async () => {
    const k = await clinic();
    const p = await patient();
    const settings = { emailNewLead: false, emailNewMessage: true, emailBookingChanges: true, emailBookingReminder: true, webPushNewLead: true, webPushNewMessage: true, webPushBookingChanges: true, webPushBookingReminder: false };
    assert.equal((await k.c.put("/api/clinics/me/notification-settings", settings)).status, 200);
    const leadId = await sentLead(p, k);
    assert.equal(find(await outbox({ lead: leadId }), "clinic_new_lead", "email").length, 0);
  });

  it("web push: abonnement giver en web_push-række, som sendes; valget kan slås fra", async () => {
    const k = await clinic();
    const p = await patient();
    const endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
    assert.equal((await k.c.post("/api/web-push-subscriptions", { endpoint, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } })).status, 204);
    const leadId = await sentLead(p, k);
    const row = await settled({ lead: leadId }, "clinic_new_lead", "web_push");
    assert.equal(row.status, "sent", row.last_error ?? "");
    assert.ok(row.dedup_key?.startsWith("web_push:"));
    assert.ok(!JSON.stringify(row).includes("fcm.googleapis.com"), "endpointet står ikke i outboxen");

    const off = { emailNewLead: true, emailNewMessage: true, emailBookingChanges: true, emailBookingReminder: true, webPushNewLead: false, webPushNewMessage: true, webPushBookingChanges: true, webPushBookingReminder: false };
    assert.equal((await k.c.put("/api/clinics/me/notification-settings", off)).status, 200);
    const p2 = await patient();
    const lead2 = await sentLead(p2, k);
    assert.equal(find(await outbox({ lead: lead2 }), "clinic_new_lead", "web_push").length, 0);
    assert.equal(find(await outbox({ lead: lead2 }), "clinic_new_lead", "email").length, 1);
  });
});

describe("påmindelser dagen før", () => {
  it("booking-reminders lægger rækker pr. booking (patient: push, e-mail og SMS; klinik: e-mail) og er idempotent", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sentLead(p, k);
    assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 200);
    const starts = new Date(Math.floor((Date.now() + 20 * HOUR) / (15 * MINUTE)) * 15 * MINUTE);
    const { data, error } = await admin
      .from("bookings")
      .insert({
        lead_id: leadId, clinic_id: k.id, patient_id: p.userId, service_id: p.serviceId,
        starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 30 * MINUTE).toISOString(), status: "booked",
        contact_name: "Lea Testesen", contact_phone: "+45 12 34 56 78", contact_email: p.email,
        created_at: new Date(Date.now() - 3 * 24 * HOUR).toISOString(),
      })
      .select("id")
      .single();
    assert.ifError(error);

    const first = await new TestClient().post("/api/cron/booking-reminders", {}, CRON);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(Object.keys(first.body).sort(), ["enqueued", "failed", "retried", "reviewReminders", "sent", "skipped"]);
    assert.ok(first.body.enqueued >= 4);
    const rows = await outbox({ booking: data!.id });
    assert.equal(find(rows, "patient_booking_reminder", "push").length, 1);
    assert.equal(find(rows, "clinic_booking_reminder", "email").length, 1);
    assert.equal(find(rows, "patient_booking_reminder", "email").length, 1);
    assert.equal(find(rows, "patient_booking_reminder", "sms").length, 1);
    assert.equal(find(rows, "clinic_booking_reminder", "web_push").length, 0, "web push-påmindelser er ikke valgt som standard");
    for (const row of rows) {
      assert.equal(["pending", "sending", "sent", "skipped"].includes(row.status), true, `${row.type}: ${row.status}`); // SMS uden nummer: skipped
    }

    const second = await new TestClient().post("/api/cron/booking-reminders", {}, CRON);
    assert.equal(second.status, 200);
    assert.equal(second.body.enqueued, 0, "anden kørsel lægger intet nyt");
    assert.equal((await outbox({ booking: data!.id })).length, rows.length);
    const sent = await settled({ booking: data!.id }, "patient_booking_reminder", "push");
    assert.equal(sent.status, "sent", sent.last_error ?? "");
  });
});
