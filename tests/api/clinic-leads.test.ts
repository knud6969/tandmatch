// API-tests for trin 5.1-5.2: klinikkens leads, beslutning og beskedtråd pr. lead (architecture 4.4, 5.7, 10.9, 10.12).
// Kører mod en rigtig app + lokal Supabase. Klinikker og patienter er fiktive og ryddes til sidst.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_CONSENT_VERSION,
  PASSWORD,
  SHARING_CONSENT_VERSION,
  TestClient,
  adminClient,
  imageForm,
  jpegWithExif,
  newClientWithTerms,
  randomCvr,
  uniqueEmail,
} from "./helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type Clinic = { c: TestClient; id: string; userId: string };
type Patient = { c: TestClient; caseId: string; userId: string; email: string };

async function clinic(verified = true): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Indbakketest Tandklinik",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const me = await c.get("/api/me");
  const id = me.body.clinic.id as string;
  if (verified) {
    const { error } = await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "verified" });
    assert.ifError(error);
  }
  return { c, id, userId: r.body.userId };
}

// Patient med konto og en sendt-klar sag (valgfrit med et billede, der uploades før opsummeringen godkendes).
async function patient(withImage = false): Promise<Patient> {
  const c = await newClientWithTerms();
  const email = uniqueEmail();
  const s = await c.post("/api/auth/signup", { role: "patient", email, password: PASSWORD, firstName: "Lea" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  const created = await c.post("/api/cases");
  const caseId = created.body.id as string;
  const catalog = await c.get("/api/services");
  const serviceId = catalog.body.groups[0].services[0].id as string;
  assert.equal((await c.put(`/api/cases/${caseId}/services`, { services: [{ serviceId, suggestedByAi: false }] })).status, 200);
  assert.equal((await c.patch(`/api/cases/${caseId}`, { postalCode: "2100", preferredTimeframe: "flexible" })).status, 200);
  if (withImage) {
    assert.equal((await c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION })).status, 201);
    const up = await c.postForm(`/api/cases/${caseId}/images`, imageForm(await jpegWithExif()));
    assert.equal(up.status, 201, JSON.stringify(up.body));
  }
  assert.equal((await c.put(`/api/cases/${caseId}/summary`, { summaryText: "Jeg vil gerne have en tjekup." })).status, 200);
  assert.equal((await c.post("/api/consents", { type: "health_data_sharing", textVersion: SHARING_CONSENT_VERSION })).status, 201);
  return { c, caseId, userId: s.body.userId, email };
}

// Sender patientens sag til klinikkerne og returnerer lead-id pr. klinik.
async function send(p: Patient, clinics: Clinic[]): Promise<string[]> {
  const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: clinics.map((k) => k.id) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return clinics.map((k) => r.body.leads.find((l: { clinic: { id: string } }) => l.clinic.id === k.id).id as string);
}

function code(r: { body: { error?: { code: string } } }) {
  return r.body.error?.code;
}

// Et kvarter-afrundet tidspunkt n dage frem (starttider ligger på hele kvarterer).
function quarter(days: number): Date {
  const t = Math.ceil((Date.now() + days * 86_400_000) / 900_000) * 900_000;
  return new Date(t);
}

async function insertBooking(leadId: string, k: Clinic, p: Patient, status: "booked" | "held") {
  const serviceId = (await admin.from("services").select("id").limit(1).single()).data!.id as string;
  const starts = quarter(3);
  const { error } = await admin.from("bookings").insert({
    lead_id: leadId,
    clinic_id: k.id,
    patient_id: p.userId,
    service_id: serviceId,
    starts_at: starts.toISOString(),
    ends_at: new Date(starts.getTime() + 30 * 60_000).toISOString(),
    status,
    hold_expires_at: status === "held" ? new Date(Date.now() + 20 * 60_000).toISOString() : null,
    contact_name: "Lea Testesen",
    contact_phone: "+45 12 34 56 78",
    contact_email: p.email,
  });
  assert.ifError(error);
}

describe("klinikkens leads: adgang", () => {
  it("afviser patient, anonym og ikke-verificeret klinik", async () => {
    const p = await patient();
    const anon = await newClientWithTerms();
    assert.equal((await anon.get("/api/leads")).status, 401);
    assert.equal((await p.c.get("/api/leads")).status, 403);
    const unverified = await clinic(false);
    const list = await unverified.c.get("/api/leads");
    assert.equal(list.status, 403);
    assert.equal(code(list), "CLINIC_NOT_VERIFIED");
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    assert.equal((await p.c.get(`/api/leads/${leadId}`)).status, 403);
    assert.equal((await p.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 403);
    assert.equal((await unverified.c.get(`/api/leads/${leadId}`)).status, 403);
    assert.equal((await unverified.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 403);
  });

  it("klinik Y ser aldrig klinik X's lead, beslutning eller beskeder", async () => {
    const p = await patient();
    const x = await clinic();
    const y = await clinic();
    const [leadX, leadY] = await send(p, [x, y]);
    const xList = await x.c.get("/api/leads");
    assert.deepEqual(xList.body.leads.map((l: { id: string }) => l.id), [leadX]);
    const yList = await y.c.get("/api/leads");
    assert.deepEqual(yList.body.leads.map((l: { id: string }) => l.id), [leadY]);
    assert.equal((await y.c.get(`/api/leads/${leadX}`)).status, 404);
    const decision = await y.c.post(`/api/leads/${leadX}/decision`, { decision: "decline", reason: "other" });
    assert.equal(decision.status, 404);
    assert.equal((await y.c.get(`/api/leads/${leadX}/messages`)).status, 404);
    assert.equal((await y.c.post(`/api/leads/${leadX}/messages`, { body: "Hej fra Y" })).status, 404);
    // X's lead er stadig ubesvaret og uset af Y
    const after = await x.c.get(`/api/leads/${leadX}`);
    assert.equal(after.body.status, "sent");
    assert.equal(after.body.decision, null);
  });
});

describe("klinikkens leads: liste og detalje", () => {
  it("lister leads med filter og sender aldrig patientens identitet", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const list = await k.c.get("/api/leads");
    assert.equal(list.status, 200);
    const item = list.body.leads[0];
    assert.equal(item.id, leadId);
    assert.equal(item.status, "sent");
    assert.equal(item.seenAt, null);
    assert.equal(item.unreadMessages, 0);
    assert.equal(item.area.postalCode, "2100");
    assert.ok(item.serviceNames.length > 0);
    assert.equal(item.isEmergency, false);
    const text = JSON.stringify(list.body);
    for (const secret of [p.userId, p.email, "Lea", p.caseId, "patientId", "caseId"]) assert.ok(!text.includes(secret), `lækker ${secret}`);
    assert.equal((await k.c.get("/api/leads?status=sent")).body.leads.length, 1);
    assert.equal((await k.c.get("/api/leads?status=accepted")).body.leads.length, 0);
    assert.equal((await k.c.get("/api/leads?status=ugyldig")).status, 400);
  });

  it("detaljen sætter seen_at og skjuler navn, kontakt og id", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const detail = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.id, leadId);
    assert.ok(detail.body.seenAt);
    assert.equal(detail.body.summaryText, "Jeg vil gerne have en tjekup.");
    assert.equal(detail.body.summaryAiAssisted, false);
    assert.ok(detail.body.services.length > 0);
    assert.equal(detail.body.booking, null);
    assert.equal(detail.body.decision, null);
    assert.deepEqual(detail.body.images, []);
    const text = JSON.stringify(detail.body);
    for (const secret of [p.userId, p.email, "Lea", p.caseId, "contact", "phone"]) assert.ok(!text.includes(secret), `lækker ${secret}`);
    const seenAt = detail.body.seenAt;
    const again = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(again.body.seenAt, seenAt, "seen_at sættes kun første gang");
    const list = await k.c.get("/api/leads");
    assert.equal(list.body.leads[0].seenAt, seenAt);
  });

  it("signerer billeder, og approvedDescription kan være null", async () => {
    const p = await patient(true);
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const detail = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(detail.body.imageCount, 1);
    assert.equal(detail.body.images.length, 1);
    const image = detail.body.images[0];
    assert.match(image.url, /token=/);
    assert.ok(image.approvedDescription === null || typeof image.approvedDescription === "string");
    assert.ok(!JSON.stringify(detail.body).includes(p.userId), "stien/patient-id lækker ikke");
    const fetched = await fetch(image.url);
    assert.equal(fetched.status, 200);
  });

  it("kontaktoplysninger vises kun for en booket tid, aldrig for en reservation", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    await insertBooking(leadId, k, p, "held");
    const held = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(held.body.booking.status, "held");
    assert.equal(held.body.booking.contact, null);
    assert.ok(held.body.booking.holdExpiresAt);
    assert.ok(!JSON.stringify(held.body).includes("Lea Testesen"));
  });

  it("accept af en lead med reservation gør tiden til en booking og viser kontakt", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    await insertBooking(leadId, k, p, "held");
    const r = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "booked");
    assert.equal(r.body.booking.status, "booked");
    assert.equal(r.body.booking.holdExpiresAt, null);
    assert.deepEqual(r.body.booking.contact, { name: "Lea Testesen", phone: "+45 12 34 56 78", email: p.email });
    assert.ok(!JSON.stringify(r.body).includes(p.userId));
    // Patientens userId i leadet er stadig skjult for andre klinikker
    const other = await clinic();
    assert.equal((await other.c.get(`/api/leads/${leadId}`)).status, 404);
  });
});

describe("klinikkens beslutning", () => {
  it("accepterer uden kommentar", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const r = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "accepted");
    assert.ok(r.body.decision.respondedAt);
    assert.equal(r.body.decision.comment, null);
    assert.equal(r.body.decision.quotedPrice, null);
    assert.ok(r.body.seenAt);
    assert.equal(r.body.booking, null);
    const mine = await p.c.get(`/api/cases/${p.caseId}/leads`);
    assert.equal(mine.body.leads[0].status, "accepted");
  });

  it("accepterer med kommentar og præciseret pris", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const r = await k.c.post(`/api/leads/${leadId}/decision`, {
      decision: "accept",
      comment: "  Vi kan se dig i næste uge.  ",
      quotedPriceMin: 800,
      quotedPriceMax: 1200,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.decision.comment, "Vi kan se dig i næste uge.");
    assert.deepEqual(r.body.decision.quotedPrice, { min: 800, max: 1200 });
    const mine = await p.c.get(`/api/cases/${p.caseId}/leads`);
    assert.deepEqual(mine.body.leads[0].quotedPrice, { min: 800, max: 1200 });
    assert.equal(mine.body.leads[0].clinicComment, "Vi kan se dig i næste uge.");
  });

  it("afviser med årsag og note", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const r = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "decline", reason: "no_capacity", note: "Fuldt booket." });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "declined");
    assert.equal(r.body.decision.declineReason, "no_capacity");
    assert.equal(r.body.decision.declineNote, "Fuldt booket.");
    const mine = await p.c.get(`/api/cases/${p.caseId}/leads`);
    assert.equal(mine.body.leads[0].status, "declined");
    assert.equal(mine.body.leads[0].declineReason, "no_capacity");
    assert.equal(mine.body.leads[0].declineNote, "Fuldt booket.", "patienten ser klinikkens note (review 1)");
    // Et besvaret lead kan ikke besvares igen
    const twice = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
    assert.equal(twice.status, 409);
    assert.equal(code(twice), "LEAD_NOT_PENDING");
  });

  it("afviser ugyldigt input, herunder clinic_left", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const post = (body: unknown) => k.c.post(`/api/leads/${leadId}/decision`, body);
    assert.equal((await post({ decision: "decline", reason: "clinic_left" })).status, 400);
    assert.equal((await post({ decision: "decline" })).status, 400);
    assert.equal((await post({ decision: "decline", reason: "other", note: "x".repeat(201) })).status, 400);
    assert.equal((await post({ decision: "accept", comment: "x".repeat(501) })).status, 400);
    assert.equal((await post({ decision: "accept", quotedPriceMin: 500 })).status, 400);
    assert.equal((await post({ decision: "accept", quotedPriceMin: 900, quotedPriceMax: 500 })).status, 400);
    assert.equal((await post({ decision: "accept", quotedPriceMin: -1, quotedPriceMax: 500 })).status, 400);
    assert.equal((await post({ decision: "maybe" })).status, 400);
    assert.equal((await post({ decision: "accept", extra: true })).status, 400);
    // Intet af det ændrede leadet
    assert.equal((await k.c.get(`/api/leads/${leadId}`)).body.status, "sent");
  });

  it("giver 409 på et lead, patienten har trukket tilbage, og viser intet indhold", async () => {
    const p = await patient(true);
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    assert.equal((await p.c.post(`/api/leads/${leadId}/withdraw`)).status, 200);
    const r = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
    assert.equal(r.status, 409);
    assert.equal(code(r), "LEAD_NOT_PENDING");
    const detail = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.status, "withdrawn");
    assert.ok(detail.body.withdrawnAt);
    assert.deepEqual(detail.body.images, []);
    assert.deepEqual(detail.body.services, []);
    assert.equal(detail.body.summaryText, "");
    assert.equal(detail.body.imageCount, 0);
    assert.equal(detail.body.area.postalCode, null);
    assert.equal(detail.body.seenAt, null);
    const list = await k.c.get("/api/leads");
    const item = list.body.leads[0];
    assert.equal(item.status, "withdrawn");
    assert.deepEqual(item.serviceNames, []);
    assert.equal(item.area.city, null);
    assert.equal(item.unreadMessages, 0);
    assert.ok(item.sentAt && item.withdrawnAt);
  });
});

describe("beskedtråd pr. lead", () => {
  it("begge parter kan skrive, og ulæste tælles korrekt", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;

    const fromPatient = await p.c.post(path, { body: "  Hvor lang tid tager det?  " });
    assert.equal(fromPatient.status, 201, JSON.stringify(fromPatient.body));
    assert.equal(fromPatient.body.fromMe, true);
    assert.equal(fromPatient.body.senderRole, "patient");
    assert.equal(fromPatient.body.body, "Hvor lang tid tager det?");
    assert.equal(fromPatient.body.readAt, null);
    await p.c.post(path, { body: "Og hvad koster det?" });

    // Klinikken: to ulæste i listen og i detaljen
    assert.equal((await k.c.get("/api/leads")).body.leads[0].unreadMessages, 2);
    assert.equal((await k.c.get(`/api/leads/${leadId}`)).body.unreadMessages, 2);
    const read = await k.c.get(path);
    assert.equal(read.status, 200);
    assert.equal(read.body.messages.length, 2);
    assert.ok(read.body.messages.every((m: { fromMe: boolean; senderRole: string }) => !m.fromMe && m.senderRole === "patient"));
    assert.ok(!JSON.stringify(read.body).includes(p.userId), "patientens id lækker ikke til klinikken");
    assert.equal((await k.c.get("/api/leads")).body.leads[0].unreadMessages, 0, "GET markerer modtagne som læst");

    const reply = await k.c.post(path, { body: "Ca. en halv time." });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal(reply.body.fromMe, true);
    assert.equal(reply.body.senderRole, "clinic");

    // Patienten: én ulæst fra klinikken
    const mine = await p.c.get(`/api/cases/${p.caseId}/leads`);
    assert.equal(mine.body.leads[0].unreadMessages, 1);
    const thread = await p.c.get(path);
    assert.equal(thread.body.messages.length, 3);
    assert.deepEqual(thread.body.messages.map((m: { senderRole: string }) => m.senderRole), ["patient", "patient", "clinic"]);
    assert.equal(thread.body.messages[2].fromMe, false);
    assert.equal((await p.c.get(`/api/cases/${p.caseId}/leads`)).body.leads[0].unreadMessages, 0);
    // Klinikken ser, at patienten har læst dens besked
    const again = await k.c.get(path);
    assert.ok(again.body.messages[2].readAt);
  });

  it("validerer beskeden og afviser fremmede", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    assert.equal((await p.c.post(path, { body: "   " })).status, 400);
    assert.equal((await p.c.post(path, { body: "x".repeat(2001) })).status, 400);
    assert.equal((await p.c.post(path, { body: "hej", senderRole: "clinic" })).status, 400);
    assert.equal((await p.c.post(path, { body: "x".repeat(2000) })).status, 201);
    const other = await patient();
    assert.equal((await other.c.get(path)).status, 404);
    assert.equal((await other.c.post(path, { body: "Hej" })).status, 404);
    const anon = await newClientWithTerms();
    assert.equal((await anon.get(path)).status, 401);
    const unverified = await clinic(false);
    assert.equal((await unverified.c.get(path)).status, 404);
  });

  it("tråden er åben før svar og efter accept, lukket ved afvisning (THREAD_CLOSED)", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    // Klinikken stiller et spørgsmål før beslutningen
    assert.equal((await k.c.post(path, { body: "Har du haft ondt længe?" })).status, 201);
    assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 200);
    assert.equal((await p.c.post(path, { body: "Siden i går." })).status, 201, "åben efter accept");

    const p2 = await patient();
    const [lead2] = await send(p2, [k]);
    const path2 = `/api/leads/${lead2}/messages`;
    assert.equal((await p2.c.post(path2, { body: "Før afvisning" })).status, 201);
    assert.equal((await k.c.post(`/api/leads/${lead2}/decision`, { decision: "decline", reason: "not_offered" })).status, 200);
    const closedPatient = await p2.c.post(path2, { body: "Efter afvisning" });
    assert.equal(closedPatient.status, 409);
    assert.equal(code(closedPatient), "THREAD_CLOSED");
    const closedClinic = await k.c.post(path2, { body: "Efter afvisning" });
    assert.equal(closedClinic.status, 409);
    assert.equal(code(closedClinic), "THREAD_CLOSED");
    // Eksisterende beskeder kan stadig læses af begge
    assert.equal((await p2.c.get(path2)).body.messages.length, 1);
    assert.equal((await k.c.get(path2)).body.messages.length, 1);
  });

  it("døgnloftet giver MESSAGE_LIMIT (429), ikke THREAD_CLOSED, mens tråden er åben", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    const rows = Array.from({ length: 200 }, (_, i) => ({ lead_id: leadId, sender_id: p.userId, body: `Fyld ${i}` }));
    assert.ifError((await admin.from("messages").insert(rows)).error);
    const limited = await p.c.post(path, { body: "Nummer 201" });
    assert.equal(limited.status, 429);
    assert.equal(code(limited), "MESSAGE_LIMIT");
    // Klinikkens loft er sit eget: dens besked går igennem på samme tråd
    assert.equal((await k.c.post(path, { body: "Klinikken svarer" })).status, 201);
    // Lukkes tråden, er svaret THREAD_CLOSED, også selvom loftet er nået
    assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "decline", reason: "other" })).status, 200);
    const closed = await p.c.post(path, { body: "Efter afvisning" });
    assert.equal(closed.status, 409);
    assert.equal(code(closed), "THREAD_CLOSED");
  });

  it("klinikken har ingen direkte læsning af leads, men tråden og statusopslaget virker", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    assert.equal((await p.c.post(path, { body: "Spørgsmål" })).status, 201);
    const sent = await k.c.post(path, { body: "Svar" });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.deepEqual(Object.keys(sent.body).sort(), ["body", "createdAt", "fromMe", "id", "readAt", "senderRole"]);
    const thread = await k.c.get(path);
    assert.equal(thread.body.messages.length, 2);
    assert.equal((await k.c.get(`/api/leads/${leadId}`)).body.unreadMessages, 0, "læst ved GET");
    // Patientens svar fra insert har samme form og ingen sender_id
    const fromPatient = await p.c.post(path, { body: "Tak" });
    assert.deepEqual(Object.keys(fromPatient.body).sort(), ["body", "createdAt", "fromMe", "id", "readAt", "senderRole"]);
    assert.equal((await k.c.get(`/api/leads/${leadId}`)).body.unreadMessages, 1);
  });

  it("tråden er lukket ved tilbagetrækning, og klinikken mister adgangen til beskederne", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    assert.equal((await p.c.post(path, { body: "Hej" })).status, 201);
    assert.equal((await p.c.post(`/api/leads/${leadId}/withdraw`)).status, 200);
    const closed = await p.c.post(path, { body: "Efter tilbagetrækning" });
    assert.equal(closed.status, 409);
    assert.equal(code(closed), "THREAD_CLOSED");
    const closedClinic = await k.c.post(path, { body: "Efter tilbagetrækning" });
    assert.equal(closedClinic.status, 409);
    assert.equal(code(closedClinic), "THREAD_CLOSED");
    assert.deepEqual((await k.c.get(path)).body.messages, [], "klinikken ser ingen beskeder på et tilbagetrukket lead");
    assert.equal((await p.c.get(path)).body.messages.length, 1, "patienten ser sin tråd");
  });

  it("bevarer klinikkens beskeder i patientens tråd, når klinikkontoen slettes", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    assert.equal((await p.c.post(path, { body: "Spørgsmål" })).status, 201);
    assert.equal((await k.c.post(path, { body: "Svar fra klinikken" })).status, 201);
    const del = await k.c.del("/api/clinics/me", { confirm: "SLET" });
    assert.equal(del.status, 204, JSON.stringify(del.body));
    const thread = await p.c.get(path);
    assert.equal(thread.status, 200);
    assert.equal(thread.body.messages.length, 2);
    assert.deepEqual(thread.body.messages.map((m: { senderRole: string }) => m.senderRole), ["patient", "clinic"]);
    assert.equal(thread.body.messages[1].fromMe, false);
    const { data } = await admin.from("messages").select("sender_id, sender_role").eq("lead_id", leadId).eq("sender_role", "clinic");
    assert.deepEqual(data, [{ sender_id: null, sender_role: "clinic" }]);
    // Leadet er afvist med clinic_left, så tråden er lukket
    const closed = await p.c.post(path, { body: "Er du der?" });
    assert.equal(closed.status, 409);
    assert.equal(code(closed), "THREAD_CLOSED");
  });
});
