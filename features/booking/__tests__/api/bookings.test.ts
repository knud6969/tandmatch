// API-tests for trin 6.1: booking, aflysning, udeblivelse, cron og telefon (architecture 4.2, 4.4, 5.3, 10.10, 12.3 punkt 32).
// Kører mod en rigtig app + lokal Supabase (run.sh afviser alt andet end localhost). Klinikker og patienter er fiktive
// og ryddes til sidst. Tider flyttes ved at indsætte bookinger med service role mod den lokale database.
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
} from "../../../../tests/api/helpers.ts";

// Samme localhost-vagt som run.sh: service role-klienten bruges kun mod lokal Supabase.
assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^http:\/\/(127\.0\.0\.1|localhost):/, "kun lokal Supabase");

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

const HOUR = 3_600_000;
const MINUTE = 60_000;

type Clinic = { c: TestClient; id: string; userId: string };
type Patient = { c: TestClient; caseId: string; userId: string; email: string; serviceId: string };

async function clinic(verified = true): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Bookingtest Tandklinik",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const id = (await c.get("/api/me")).body.clinic.id as string;
  if (verified) {
    const { error } = await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "verified" });
    assert.ifError(error);
    // Åbent alle ugens dage 06-22, så der altid er ledige tider.
    const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ clinic_id: id, weekday, opens_at: "06:00", closes_at: "22:00", is_emergency: false }));
    assert.ifError((await admin.from("clinic_opening_hours").insert(hours)).error);
  }
  return { c, id, userId: r.body.userId };
}

// Patient med konto og en sendeklar sag med én bekræftet ydelse.
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

async function sendTo(p: Patient, k: Clinic): Promise<string> {
  const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [k.id] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.leads[0].id as string;
}

// Sendt og accepteret lead.
async function acceptedLead(k: Clinic, p?: Patient): Promise<{ p: Patient; leadId: string }> {
  const patientHere = p ?? (await patient());
  const leadId = await sendTo(patientHere, k);
  const r = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "accepted");
  return { p: patientHere, leadId };
}

function code(r: { body: { error?: { code: string } } }) {
  return r.body.error?.code;
}

// Første ledige tid for leadet, via ruten under test.
async function firstSlot(p: Patient, leadId: string): Promise<{ startsAt: string; endsAt: string }> {
  const r = await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.slots.length > 0, "der skal være ledige tider");
  return r.body.slots[0];
}

const bookBody = (p: Patient, startsAt: string) => ({
  serviceId: p.serviceId,
  startsAt,
  contactName: "Lea Testesen",
  contactPhone: "+45 12 34 56 78",
});

// Hele kvarter, så starttiden opfylder databasens krav.
function quarter(ms: number): Date {
  return new Date(Math.floor(ms / (15 * MINUTE)) * 15 * MINUTE);
}

type Scenario = { status?: "booked" | "held"; holdExpiresAt?: Date; minutes?: number };

// Booking indsat direkte med service role, så starttiden kan ligge i fortiden (eller en reservation kan være udløbet).
// Leadet sættes til `booked` for en booking, ellers urørt.
async function insertBooking(leadId: string, k: Clinic, p: Patient, startsAt: Date, opts: Scenario = {}): Promise<string> {
  const status = opts.status ?? "booked";
  const starts = quarter(startsAt.getTime());
  const { data, error } = await admin
    .from("bookings")
    .insert({
      lead_id: leadId,
      clinic_id: k.id,
      patient_id: p.userId,
      service_id: p.serviceId,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + (opts.minutes ?? 30) * MINUTE).toISOString(),
      status,
      hold_expires_at: status === "held" ? (opts.holdExpiresAt ?? new Date(Date.now() + 20 * MINUTE)).toISOString() : null,
      contact_name: "Lea Testesen",
      contact_phone: "+45 12 34 56 78",
      contact_email: p.email,
    })
    .select("id")
    .single();
  assert.ifError(error);
  if (status === "booked") assert.ifError((await admin.from("leads").update({ status: "booked" }).eq("id", leadId)).error);
  return data!.id as string;
}

// En accepteret booking hos en ny klinik med givet start (relativt til nu).
async function bookingAt(offsetMs: number, minutes = 30) {
  const k = await clinic();
  const { p, leadId } = await acceptedLead(k);
  const id = await insertBooking(leadId, k, p, new Date(Date.now() + offsetMs), { minutes });
  return { k, p, leadId, id };
}

describe("ledige tider for et lead", () => {
  it("giver kvarterstider hos leadets klinik for et accepteret lead", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const r = await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.slots.length > 0);
    for (const slot of r.body.slots as { startsAt: string; endsAt: string }[]) {
      assert.equal(new Date(slot.startsAt).getTime() % (15 * MINUTE), 0);
      assert.ok(Date.parse(slot.startsAt) >= Date.now() + 30 * MINUTE - 1000, "mindst 30 minutters varsel");
    }
    // højst 14 dage pr. kald, ydelse uden for sagen afvises
    const from = new Date().toISOString();
    const far = new Date(Date.now() + 20 * 24 * HOUR).toISOString();
    assert.equal((await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}&from=${from}&to=${far}`)).status, 400);
    const other = (await p.c.get("/api/services")).body.groups.flatMap((g: { services: { id: string }[] }) => g.services).find((s: { id: string }) => s.id !== p.serviceId);
    assert.equal((await p.c.get(`/api/leads/${leadId}/availability?serviceId=${other.id}`)).status, 400);
    assert.equal((await p.c.get(`/api/leads/${leadId}/availability`)).status, 400);
  });

  it("kræver et accepteret lead og ejerskab", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sendTo(p, k);
    const sent = await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`);
    assert.equal(sent.status, 409);
    assert.equal(code(sent), "LEAD_NOT_ACCEPTED");
    await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
    const stranger = await patient();
    assert.equal((await stranger.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`)).status, 404);
    assert.equal((await k.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`)).status, 403);
    assert.equal((await (await newClientWithTerms()).get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`)).status, 401);
  });
});

describe("booking af et accepteret lead", () => {
  it("opretter en booking, sætter leadet til booked og gemmer telefonen", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const slot = await firstSlot(p, leadId);
    const r = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slot.startsAt));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.leadId, leadId);
    assert.equal(r.body.status, "booked");
    assert.equal(r.body.startsAt, slot.startsAt);
    assert.equal(r.body.endsAt, slot.endsAt);
    assert.equal(r.body.service.id, p.serviceId);
    assert.equal(r.body.clinic.id, k.id);
    assert.equal(r.body.clinic.name, "Bookingtest Tandklinik");
    assert.equal(r.body.clinic.address, "Testvej 1");
    assert.equal(r.body.clinic.city, "København Ø");
    assert.equal(r.body.canCancel, true);
    assert.equal(r.body.canReview, false);
    assert.equal(r.body.holdExpiresAt, null);
    // leadet viser bookingen (PatientLeadDto.booking) og er booked
    const leads = await p.c.get(`/api/cases/${p.caseId}/leads`);
    assert.equal(leads.body.leads[0].status, "booked");
    assert.equal(leads.body.leads[0].booking.id, r.body.id);
    // tiden er ikke længere ledig, telefonen er gemt
    const again = await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`);
    assert.equal(again.status, 409, "leadet er booked, så der er ikke flere tider at vælge");
    assert.equal((await p.c.get("/api/patients/me")).body.phone, "+45 12 34 56 78");
    // en ny booking på samme lead afvises
    const twice = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slot.startsAt));
    assert.equal(twice.status, 409);
    assert.equal(code(twice), "LEAD_NOT_ACCEPTED");
  });

  it("SLOT_TAKEN ved overlap, og tiden forsvinder fra de andres ledige tider", async () => {
    const k = await clinic();
    const first = await acceptedLead(k);
    const second = await acceptedLead(k);
    const slot = await firstSlot(first.p, first.leadId);
    assert.equal((await first.p.c.post(`/api/leads/${first.leadId}/booking`, bookBody(first.p, slot.startsAt))).status, 201);
    const free = await second.p.c.get(`/api/leads/${second.leadId}/availability?serviceId=${second.p.serviceId}`);
    assert.ok(!free.body.slots.some((s: { startsAt: string }) => s.startsAt === slot.startsAt), "den bookede tid er optaget");
    const taken = await second.p.c.post(`/api/leads/${second.leadId}/booking`, bookBody(second.p, slot.startsAt));
    assert.equal(taken.status, 409);
    assert.equal(code(taken), "SLOT_TAKEN");
    // et overlappende starttidspunkt (15 min senere, inden for varigheden) er også optaget
    const overlapping = new Date(Date.parse(slot.startsAt) + 15 * MINUTE).toISOString();
    const overlap = await second.p.c.post(`/api/leads/${second.leadId}/booking`, bookBody(second.p, overlapping));
    assert.equal(overlap.status, 409);
    assert.equal(code(overlap), "SLOT_TAKEN");
    // leadet er stadig accepteret, og en anden tid kan bookes
    const next = free.body.slots.find((s: { startsAt: string }) => Date.parse(s.startsAt) >= Date.parse(slot.endsAt));
    assert.equal((await second.p.c.post(`/api/leads/${second.leadId}/booking`, bookBody(second.p, next.startsAt))).status, 201);
  });

  it("LEAD_NOT_ACCEPTED for et ubesvaret og et afvist lead", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sendTo(p, k);
    const when = new Date(Date.now() + 2 * HOUR);
    when.setMinutes(Math.ceil(when.getMinutes() / 15) * 15, 0, 0);
    const sent = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, when.toISOString()));
    assert.equal(sent.status, 409);
    assert.equal(code(sent), "LEAD_NOT_ACCEPTED");
    await k.c.post(`/api/leads/${leadId}/decision`, { decision: "decline", reason: "other" });
    const declined = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, when.toISOString()));
    assert.equal(declined.status, 409);
    assert.equal(code(declined), "LEAD_NOT_ACCEPTED");
  });

  it("SLOT_UNAVAILABLE for en tid uden for kvarter, i fortiden eller uden for åbningstiden", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const slot = await firstSlot(p, leadId);
    const offGrid = new Date(Date.parse(slot.startsAt) + MINUTE).toISOString();
    const a = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, offGrid));
    assert.equal(a.status, 409);
    assert.equal(code(a), "SLOT_UNAVAILABLE");
    const past = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, quarter(Date.now() - 2 * HOUR).toISOString()));
    assert.equal(code(past), "SLOT_UNAVAILABLE");
    const tooFar = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, quarter(Date.now() + 70 * 24 * HOUR).toISOString()));
    assert.equal(code(tooFar), "SLOT_UNAVAILABLE");
    // kl. 03 lokal tid ligger før åbning (06:00) hver dag; find et kvarter i UTC-døgnet og tjek via DB-reglen
    const night = new Date(Date.now() + 3 * 24 * HOUR);
    night.setUTCHours(1, 0, 0, 0); // 02-03 lokal tid
    const closed = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, night.toISOString()));
    assert.equal(code(closed), "SLOT_UNAVAILABLE");
  });

  it("validerer input og afviser forkert rolle, anonym og fremmed lead", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const slot = await firstSlot(p, leadId);
    const path = `/api/leads/${leadId}/booking`;
    assert.equal((await p.c.post(path, { ...bookBody(p, slot.startsAt), contactName: "L" })).status, 400);
    assert.equal((await p.c.post(path, { ...bookBody(p, slot.startsAt), contactPhone: "abc" })).status, 400);
    assert.equal((await p.c.post(path, { ...bookBody(p, slot.startsAt), startsAt: "i morgen" })).status, 400);
    assert.equal((await p.c.post(path, { ...bookBody(p, slot.startsAt), extra: 1 })).status, 400);
    assert.equal((await p.c.post(path, { serviceId: p.serviceId })).status, 400);
    const otherService = (await p.c.get("/api/services")).body.groups.flatMap((g: { services: { id: string }[] }) => g.services).find((s: { id: string }) => s.id !== p.serviceId);
    const wrong = await p.c.post(path, { ...bookBody(p, slot.startsAt), serviceId: otherService.id });
    assert.equal(wrong.status, 400, "kun sagens ydelser kan bookes");
    assert.equal((await k.c.post(path, bookBody(p, slot.startsAt))).status, 403);
    const stranger = await patient();
    assert.equal((await stranger.c.post(path, bookBody(stranger, slot.startsAt))).status, 404);
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    const anonRes = await anon.post(path, bookBody(p, slot.startsAt));
    assert.equal(anonRes.status, 403);
    assert.equal(code(anonRes), "ACCOUNT_REQUIRED");
    assert.equal((await (await newClientWithTerms()).post(path, bookBody(p, slot.startsAt))).status, 401);
  });
});

describe("kontaktoplysninger følger bookingen", () => {
  it("er skjult før booking, synlig for den booket tid og skjult igen efter aflysning", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const before = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(before.body.booking, null);
    for (const secret of ["Lea Testesen", "+45 12 34 56 78", p.email, p.userId]) assert.ok(!JSON.stringify(before.body).includes(secret), `lækker ${secret}`);
    const slot = await firstSlot(p, leadId);
    const booked = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slot.startsAt));
    assert.equal(booked.status, 201);

    const detail = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(detail.body.status, "booked");
    assert.equal(detail.body.booking.id, booked.body.id);
    assert.deepEqual(detail.body.booking.contact, { name: "Lea Testesen", phone: "+45 12 34 56 78", email: p.email });
    assert.equal(detail.body.booking.canCancel, true);
    assert.equal(detail.body.booking.canMarkNoShow, false);
    assert.ok(!JSON.stringify(detail.body).includes(p.userId), "patient-id når aldrig klinikken");

    const calendar = await k.c.get("/api/bookings");
    assert.equal(calendar.status, 200);
    const entry = calendar.body.bookings.find((b: { id: string }) => b.id === booked.body.id);
    assert.deepEqual(entry.contact, { name: "Lea Testesen", phone: "+45 12 34 56 78", email: p.email });
    assert.equal(entry.leadId, leadId);
    assert.ok(!JSON.stringify(calendar.body).includes(p.userId));

    // aflysning fra klinikken: kontakt skjules igen, leadet er accepteret og kan bookes på ny
    const cancelled = await k.c.post(`/api/bookings/${booked.body.id}/cancel`);
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.status, "cancelled");
    assert.equal(cancelled.body.contact, null);
    assert.equal(cancelled.body.canCancel, false);
    const afterDetail = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(afterDetail.body.status, "accepted");
    assert.equal(afterDetail.body.booking.status, "cancelled");
    assert.equal(afterDetail.body.booking.contact, null);
    assert.ok(!JSON.stringify(afterDetail.body).includes("Lea Testesen"));
    const again = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slot.startsAt));
    assert.equal(again.status, 201, "tiden er frigivet igen");
    const patientLead = await p.c.get(`/api/cases/${p.caseId}/leads`);
    assert.equal(patientLead.body.leads[0].booking.id, again.body.id, "leadet viser den aktive booking, ikke den aflyste");
  });

  it("en anden klinik og en anden patient ser hverken booking eller kontakt", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const slot = await firstSlot(p, leadId);
    const booked = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slot.startsAt));
    const other = await clinic();
    assert.deepEqual((await other.c.get("/api/bookings")).body.bookings, []);
    assert.equal((await other.c.get(`/api/leads/${leadId}`)).status, 404);
    const stranger = await patient();
    assert.deepEqual((await stranger.c.get("/api/bookings")).body.bookings, []);
    assert.equal((await stranger.c.post(`/api/bookings/${booked.body.id}/cancel`)).status, 404);
    assert.equal((await other.c.post(`/api/bookings/${booked.body.id}/cancel`)).status, 404);
    assert.equal((await other.c.post(`/api/bookings/${booked.body.id}/no-show`)).status, 404);
    // bookingen er uændret
    assert.equal((await p.c.get("/api/bookings")).body.bookings[0].status, "booked");
  });
});

describe("loft og grænser på booking (6.7a)", () => {
  it("den 6. booking på samme lead afvises med 409 BOOKING_LIMIT, også efter aflysninger", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const slots = (await p.c.get(`/api/leads/${leadId}/availability?serviceId=${p.serviceId}`)).body.slots as { startsAt: string }[];
    assert.ok(slots.length >= 6);
    for (let i = 0; i < 5; i++) {
      const booked = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slots[i * 2].startsAt));
      assert.equal(booked.status, 201, JSON.stringify(booked.body));
      const cancelled = await p.c.post(`/api/bookings/${booked.body.id}/cancel`);
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    }
    assert.equal((await k.c.get(`/api/leads/${leadId}`)).body.status, "accepted");
    const sixth = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slots[10].startsAt));
    assert.equal(sixth.status, 409);
    assert.equal(code(sixth), "BOOKING_LIMIT");
    assert.equal((await p.c.get("/api/bookings")).body.bookings.filter((b: { status: string }) => b.status === "booked").length, 0);
  });

  it("telefonnummeret kræver mindst 8 cifre", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const slot = await firstSlot(p, leadId);
    for (const phone of ["((((((", "+ - ( ) +", "1234567", "+45 1234"]) {
      const r = await p.c.post(`/api/leads/${leadId}/booking`, { ...bookBody(p, slot.startsAt), contactPhone: phone });
      assert.equal(r.status, 400, phone);
      assert.equal(code(r), "VALIDATION_ERROR");
    }
    assert.equal((await p.c.patch("/api/patients/me", { phone: "((((((" })).status, 400);
    const ok = await p.c.post(`/api/leads/${leadId}/booking`, { ...bookBody(p, slot.startsAt), contactPhone: "12 34 56 78" });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
  });

  it("bookingforsøg er begrænset pr. IP (30 pr. time) med 429 RATE_LIMITED", async () => {
    const p = await patient();
    const body = bookBody(p, new Date(Date.now() + 2 * HOUR).toISOString());
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await p.c.post(`/api/leads/${crypto.randomUUID()}/booking`, body)).status;
    assert.equal(last, 429);
  });
});

describe("aflysning", () => {
  it("patienten kan aflyse før starttid, og leadet bliver accepteret igen", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const slot = await firstSlot(p, leadId);
    const booked = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slot.startsAt));
    const r = await p.c.post(`/api/bookings/${booked.body.id}/cancel`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "cancelled");
    assert.equal(r.body.canCancel, false);
    assert.equal((await k.c.get(`/api/leads/${leadId}`)).body.status, "accepted");
    const twice = await p.c.post(`/api/bookings/${booked.body.id}/cancel`);
    assert.equal(twice.status, 409);
    assert.equal(code(twice), "BOOKING_NOT_CANCELLABLE");
  });

  it("hverken patient eller klinik kan aflyse efter starttid", async () => {
    const started = await bookingAt(-30 * MINUTE, 60);
    const byPatient = await started.p.c.post(`/api/bookings/${started.id}/cancel`);
    assert.equal(byPatient.status, 409);
    assert.equal(code(byPatient), "BOOKING_NOT_CANCELLABLE");
    const byClinic = await started.k.c.post(`/api/bookings/${started.id}/cancel`);
    assert.equal(byClinic.status, 409);
    assert.equal(code(byClinic), "BOOKING_NOT_CANCELLABLE");
    const list = await started.p.c.get("/api/bookings");
    assert.equal(list.body.bookings[0].canCancel, false);
    assert.equal(list.body.bookings[0].status, "booked");
  });

  it("ikke-verificeret klinik og forkert rolle", async () => {
    const unverified = await clinic(false);
    const r = await unverified.c.get("/api/bookings");
    assert.equal(r.status, 403);
    assert.equal(code(r), "CLINIC_NOT_VERIFIED");
    assert.equal(code(await unverified.c.post(`/api/bookings/${crypto.randomUUID()}/no-show`)), "CLINIC_NOT_VERIFIED");
    const p = await patient();
    assert.equal((await p.c.post(`/api/bookings/${crypto.randomUUID()}/no-show`)).status, 403);
    assert.equal((await p.c.post(`/api/bookings/ikke-et-id/cancel`)).status, 404);
    assert.equal((await (await newClientWithTerms()).get("/api/bookings")).status, 401);
  });
});

describe("udeblivelse og gennemførte besøg", () => {
  it("udeblivelse før starttid afvises med NO_SHOW_WINDOW_CLOSED", async () => {
    const future = await bookingAt(2 * HOUR);
    const r = await future.k.c.post(`/api/bookings/${future.id}/no-show`);
    assert.equal(r.status, 409);
    assert.equal(code(r), "NO_SHOW_WINDOW_CLOSED");
    const entry = (await future.k.c.get("/api/bookings")).body.bookings.find((b: { id: string }) => b.id === future.id);
    assert.equal(entry.canMarkNoShow, false);
    assert.equal(entry.canCancel, true);
  });

  it("udeblivelse inden for vinduet registreres, og kontakt skjules", async () => {
    const started = await bookingAt(-90 * MINUTE, 30); // sluttede for ca. en time siden
    const entry = (await started.k.c.get("/api/bookings")).body.bookings.find((b: { id: string }) => b.id === started.id);
    assert.equal(entry.status, "booked");
    assert.equal(entry.canMarkNoShow, true);
    assert.equal(entry.contact.name, "Lea Testesen");
    const r = await started.k.c.post(`/api/bookings/${started.id}/no-show`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "no_show");
    assert.equal(r.body.canMarkNoShow, false);
    assert.equal(r.body.contact, null);
    const twice = await started.k.c.post(`/api/bookings/${started.id}/no-show`);
    assert.equal(code(twice), "NO_SHOW_WINDOW_CLOSED");
    const patientView = await started.p.c.get("/api/bookings");
    assert.equal(patientView.body.bookings[0].status, "no_show");
    assert.equal(patientView.body.bookings[0].canReview, false);
  });

  it("efter ends_at + 24 timer er besøget gennemført: ingen udeblivelse, kontakt synlig, patienten kan anmelde", async () => {
    const old = await bookingAt(-26 * HOUR, 30); // sluttede for ca. 25,5 time siden
    const r = await old.k.c.post(`/api/bookings/${old.id}/no-show`);
    assert.equal(r.status, 409);
    assert.equal(code(r), "NO_SHOW_WINDOW_CLOSED");
    const entry = (await old.k.c.get("/api/bookings")).body.bookings.find((b: { id: string }) => b.id === old.id);
    assert.equal(entry.status, "completed", "effektiv status, også før cron har kørt");
    assert.equal(entry.canMarkNoShow, false);
    assert.equal(entry.contact.phone, "+45 12 34 56 78");
    const mine = (await old.p.c.get("/api/bookings")).body.bookings[0];
    assert.equal(mine.status, "completed");
    assert.equal(mine.canReview, true);
    assert.equal(mine.canCancel, false);
    // databasen har stadig status booked, indtil cron skriver den ned
    const row = (await admin.from("bookings").select("status").eq("id", old.id).single()).data;
    assert.equal(row?.status, "booked");
  });

  it("canReview er falsk mellem sluttid og fristens udløb", async () => {
    const recent = await bookingAt(-2 * HOUR, 30);
    const mine = (await recent.p.c.get("/api/bookings")).body.bookings[0];
    assert.equal(mine.status, "booked");
    assert.equal(mine.canReview, false);
    assert.equal(mine.canCancel, false);
  });

  it("klinikkens kalender kan afgrænses, og ugyldige grænser afvises", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const id = await insertBooking(leadId, k, p, new Date(Date.now() + 5 * 24 * HOUR));
    const from = new Date(Date.now() + 4 * 24 * HOUR).toISOString();
    const to = new Date(Date.now() + 6 * 24 * HOUR).toISOString();
    const hit = await k.c.get(`/api/bookings?from=${from}&to=${to}`);
    assert.deepEqual(hit.body.bookings.map((b: { id: string }) => b.id), [id]);
    const miss = await k.c.get(`/api/bookings?from=${new Date(Date.now() + 10 * 24 * HOUR).toISOString()}&to=${new Date(Date.now() + 11 * 24 * HOUR).toISOString()}`);
    assert.deepEqual(miss.body.bookings, []);
    assert.equal((await k.c.get(`/api/bookings?from=${to}&to=${from}`)).status, 400);
    assert.equal((await k.c.get(`/api/bookings?from=${from}&to=${new Date(Date.now() + 200 * 24 * HOUR).toISOString()}`)).status, 400);
    assert.equal((await k.c.get("/api/bookings?from=i-morgen")).status, 400);
  });
});

function middayTomorrow(): Date {
  const d = new Date(Date.now() + 24 * HOUR);
  d.setUTCHours(10, 0, 0, 0); // 11 eller 12 dansk tid
  return d;
}

// 12.3 punkt 32: en ikke-udløbet held-booking gennem API'et.
describe("reserveret akuttid (held)", () => {
  it("er en reservation for begge parter, uden kontakt for klinikken, og blokerer tiden", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sendTo(p, k); // sent
    const starts = middayTomorrow(); // inden for åbningstiden uanset hvornår testen kører
    const id = await insertBooking(leadId, k, p, starts, { status: "held" });

    const detail = await k.c.get(`/api/leads/${leadId}`);
    assert.equal(detail.body.booking.id, id);
    assert.equal(detail.body.booking.status, "held");
    assert.equal(detail.body.booking.contact, null);
    assert.ok(detail.body.booking.holdExpiresAt);
    assert.equal(detail.body.booking.canCancel, false);
    assert.equal(detail.body.booking.canMarkNoShow, false);
    const calendar = (await k.c.get("/api/bookings")).body.bookings.find((b: { id: string }) => b.id === id);
    assert.equal(calendar.status, "held");
    assert.equal(calendar.contact, null);
    for (const secret of ["Lea Testesen", "+45 12 34 56 78", p.email, p.userId]) {
      assert.ok(!JSON.stringify([detail.body, calendar]).includes(secret), `lækker ${secret}`);
    }

    const mine = (await p.c.get("/api/bookings")).body.bookings[0];
    assert.equal(mine.status, "held");
    assert.ok(mine.holdExpiresAt);
    assert.equal(mine.canCancel, false);
    assert.equal(mine.canReview, false);
    const lead = (await p.c.get(`/api/cases/${p.caseId}/leads`)).body.leads[0];
    assert.equal(lead.status, "sent");
    assert.equal(lead.booking.status, "held");
    const cases = (await p.c.get("/api/cases")).body.cases;
    assert.equal(cases[0].nextBooking, null, "en reservation er ikke en booket tid");
    assert.equal((await p.c.post(`/api/bookings/${id}/cancel`)).status, 409);
    assert.equal(code(await k.c.post(`/api/bookings/${id}/no-show`)), "NO_SHOW_WINDOW_CLOSED");

    // tiden er optaget for en anden patient hos samme klinik
    const second = await acceptedLead(k);
    const free = await second.p.c.get(`/api/leads/${second.leadId}/availability?serviceId=${second.p.serviceId}&to=${new Date(starts.getTime() + 5 * HOUR).toISOString()}`);
    assert.ok(!free.body.slots.some((s: { startsAt: string }) => s.startsAt === quarter(starts.getTime()).toISOString()));
    const taken = await second.p.c.post(`/api/leads/${second.leadId}/booking`, bookBody(second.p, quarter(starts.getTime()).toISOString()));
    assert.equal(code(taken), "SLOT_TAKEN");
  });

  it("en udløbet reservation frigiver tiden uden at cron har kørt", async () => {
    const k = await clinic();
    const p = await patient();
    const leadId = await sendTo(p, k);
    const starts = middayTomorrow();
    await insertBooking(leadId, k, p, starts, { status: "held", holdExpiresAt: new Date(Date.now() - MINUTE) });
    const mine = (await p.c.get("/api/bookings")).body.bookings[0];
    assert.equal(mine.status, "cancelled", "effektiv status");
    assert.equal((await k.c.get(`/api/leads/${leadId}`)).body.booking.status, "cancelled");
    const second = await acceptedLead(k);
    const slot = quarter(starts.getTime()).toISOString();
    const r = await second.p.c.post(`/api/leads/${second.leadId}/booking`, bookBody(second.p, slot));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.startsAt, slot);
  });
});

describe("cron: complete-bookings", () => {
  const url = "/api/cron/complete-bookings";

  it("401 uden secret, med forkert secret og uden Bearer, for GET og POST", async () => {
    const c = new TestClient();
    assert.equal((await c.post(url)).status, 401);
    assert.equal((await c.post(url, {}, { authorization: "Bearer forkert-forkert-forkert" })).status, 401);
    assert.equal((await c.post(url, {}, { authorization: process.env.CRON_SECRET! })).status, 401);
    assert.equal((await fetch(BASE_URL + url)).status, 401);
  });

  it("200 med secret uden vilkårs-cookie: skriver completed og frigiver udløbne reservationer", async () => {
    const old = await bookingAt(-27 * HOUR, 30);
    const fresh = await bookingAt(-2 * HOUR, 30);
    const k = await clinic();
    const p = await patient();
    const leadId = await sendTo(p, k);
    const held = await insertBooking(leadId, k, p, new Date(Date.now() + 3 * HOUR), { status: "held", holdExpiresAt: new Date(Date.now() - MINUTE) });
    const r = await new TestClient().post(url, {}, { authorization: `Bearer ${process.env.CRON_SECRET}` });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.completed >= 1);
    assert.ok(r.body.releasedHolds >= 1);
    assert.deepEqual(Object.keys(r.body).sort(), ["completed", "releasedHolds"]);
    const status = async (id: string) => (await admin.from("bookings").select("status").eq("id", id).single()).data?.status;
    assert.equal(await status(old.id), "completed");
    assert.equal(await status(fresh.id), "booked", "fristen er ikke udløbet");
    assert.equal(await status(held), "cancelled");
    const get = await fetch(BASE_URL + url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(get.status, 200);
  });
});

describe("telefon på patientens profil og dataeksport", () => {
  it("GET og PATCH /api/patients/me har phone", async () => {
    const p = await patient();
    assert.equal((await p.c.get("/api/patients/me")).body.phone, null);
    const set = await p.c.patch("/api/patients/me", { phone: "+45 22 33 44 55" });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.phone, "+45 22 33 44 55");
    assert.equal(set.body.firstName, "Lea");
    assert.equal((await p.c.get("/api/patients/me")).body.phone, "+45 22 33 44 55");
    assert.equal((await p.c.patch("/api/patients/me", { phone: "abc" })).status, 400);
    assert.equal((await p.c.patch("/api/patients/me", { firstName: "Mia" })).body.phone, "+45 22 33 44 55", "uændret ved anden ændring");
    const cleared = await p.c.patch("/api/patients/me", { phone: null });
    assert.equal(cleared.body.phone, null);
  });

  it("eksporten indeholder bookings, kun patientens egne", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const slot = await firstSlot(p, leadId);
    const booked = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slot.startsAt));
    const other = await acceptedLead(k);
    const otherSlot = (await other.p.c.get(`/api/leads/${other.leadId}/availability?serviceId=${other.p.serviceId}`)).body.slots.find(
      (s: { startsAt: string }) => Date.parse(s.startsAt) >= Date.parse(slot.endsAt),
    );
    await other.p.c.post(`/api/leads/${other.leadId}/booking`, bookBody(other.p, otherSlot.startsAt));

    const r = await p.c.get("/api/patients/me/export");
    assert.equal(r.status, 200);
    assert.equal(r.body.bookings.length, 1);
    const entry = r.body.bookings[0];
    assert.equal(entry.id, booked.body.id);
    assert.equal(entry.leadId, leadId);
    assert.equal(entry.clinicName, "Bookingtest Tandklinik");
    assert.equal(entry.status, "booked");
    assert.equal(entry.contactName, "Lea Testesen");
    assert.equal(entry.contactPhone, "+45 12 34 56 78");
    assert.equal(entry.contactEmail, p.email);
    assert.ok(!JSON.stringify(r.body.bookings).includes(other.p.email));
    const anon = await newClientWithTerms();
    await anon.startAnonymous();
    assert.deepEqual((await anon.get("/api/patients/me/export")).body.bookings, []);
  });
});
