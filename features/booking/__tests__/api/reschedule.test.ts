// API-tests for flyt tid (architecture 10.16, platform 14.4, RLS-punkt 57). Samme opsætning som bookings.test.ts.
// Kører mod en rigtig app + lokal Supabase (run.sh afviser alt andet end localhost). Klinikker og patienter er fiktive
// og ryddes til sidst. Bookinger i fortiden indsættes med service role mod den lokale database.
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
  // [PROTOTYPE] Nye klinikker auto-verificeres ved oprettelse; en ikke-verificeret testklinik sættes eksplicit til registered.
  if (!verified) assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "registered" })).error);
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


// Første ledige tid, der ikke er bookingens egen, via ruten under test (availability for bookingen).
async function otherSlot(p: Patient, bookingId: string, notStartsAt: string): Promise<{ startsAt: string; endsAt: string }> {
  const r = await p.c.get(`/api/bookings/${bookingId}/availability`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const slot = (r.body.slots as { startsAt: string; endsAt: string }[]).find((s) => s.startsAt !== notStartsAt);
  assert.ok(slot, "der skal være en anden ledig tid");
  return slot;
}

async function booked() {
  const k = await clinic();
  const { p, leadId } = await acceptedLead(k);
  const slot = await firstSlot(p, leadId);
  const r = await p.c.post(`/api/leads/${leadId}/booking`, bookBody(p, slot.startsAt));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { k, p, leadId, booking: r.body, slot };
}

describe("flyt tid", () => {
  it("flytter til en anden tid: ny booking, den gamle aflyst, leadet booked, og klinikken får besked", async () => {
    const { k, p, leadId, booking } = await booked();
    assert.equal(booking.canReschedule, true);
    const next = await otherSlot(p, booking.id, booking.startsAt);
    const r = await p.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt: next.startsAt });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.notEqual(r.body.id, booking.id);
    assert.equal(r.body.status, "booked");
    assert.equal(r.body.startsAt, next.startsAt);
    assert.equal(r.body.rescheduledFrom, booking.startsAt);
    assert.equal(r.body.service.id, booking.service.id);

    const list = (await p.c.get("/api/bookings")).body.bookings as { id: string; status: string; rescheduledTo: string | null; canReschedule: boolean }[];
    const old = list.find((b) => b.id === booking.id)!;
    assert.equal(old.status, "cancelled");
    assert.equal(old.rescheduledTo, next.startsAt);
    assert.equal(old.canReschedule, false);

    const lead = await admin.from("leads").select("status").eq("id", leadId).single();
    assert.equal(lead.data?.status, "booked");

    // Klinikkens kalender: kontakt kun på den nye, og begge viser flytningen.
    const cal = (await k.c.get("/api/bookings")).body.bookings as {
      id: string;
      contact: unknown;
      rescheduledFrom: string | null;
      rescheduledTo: string | null;
      cancelledBy: string | null;
    }[];
    const newer = cal.find((b) => b.id === r.body.id)!;
    const older = cal.find((b) => b.id === booking.id)!;
    assert.ok(newer.contact);
    assert.equal(newer.rescheduledFrom, booking.startsAt);
    assert.equal(older.contact, null);
    assert.equal(older.rescheduledTo, next.startsAt);
    assert.equal(older.cancelledBy, "patient");

    // Outbox: præcis én flytning, ingen aflysning.
    const rows = await admin.from("notification_outbox").select("type, payload").eq("clinic_id", k.id).in("type", ["clinic_booking_rescheduled", "clinic_booking_cancelled"]);
    assert.ifError(rows.error);
    const types = (rows.data ?? []).map((row) => row.type);
    assert.ok(types.includes("clinic_booking_rescheduled"));
    assert.ok(!types.includes("clinic_booking_cancelled"));
    const payload = rows.data!.find((row) => row.type === "clinic_booking_rescheduled")!.payload as Record<string, string>;
    assert.equal(payload.previousStartsAt, booking.startsAt.replace(".000Z", "Z"));
  });

  it("kan flytte igen (den nye kan flyttes)", async () => {
    const { p, booking } = await booked();
    const a = await otherSlot(p, booking.id, booking.startsAt);
    const first = await p.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt: a.startsAt });
    assert.equal(first.status, 200);
    const b = await otherSlot(p, first.body.id, a.startsAt);
    const second = await p.c.post(`/api/bookings/${first.body.id}/reschedule`, { startsAt: b.startsAt });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.rescheduledFrom, a.startsAt);
  });

  it("SLOT_TAKEN lader den gamle tid stå", async () => {
    const { k, p, booking } = await booked();
    const other = await acceptedLead(k);
    const slots = (await other.p.c.get(`/api/leads/${other.leadId}/availability?serviceId=${other.p.serviceId}`)).body.slots as { startsAt: string }[];
    const target = slots.find((s) => s.startsAt !== booking.startsAt)!;
    assert.equal((await other.p.c.post(`/api/leads/${other.leadId}/booking`, bookBody(other.p, target.startsAt))).status, 201);
    const r = await p.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt: target.startsAt });
    assert.equal(r.status, 409);
    assert.equal(code(r), "SLOT_TAKEN");
    const mine = (await p.c.get("/api/bookings")).body.bookings as { id: string; status: string }[];
    assert.equal(mine.find((b) => b.id === booking.id)?.status, "booked");
    assert.equal(mine.length, 1);
  });

  it("afviser samme tid, ugyldig tid og ugyldigt input", async () => {
    const { p, booking } = await booked();
    const same = await p.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt: booking.startsAt });
    assert.equal(same.status, 400);
    assert.equal(code(same), "VALIDATION_ERROR");
    const past = await p.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt: new Date(Date.now() - HOUR).toISOString() });
    assert.equal(past.status, 409);
    assert.equal(code(past), "SLOT_UNAVAILABLE");
    assert.equal((await p.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt: "i morgen" })).status, 400);
    assert.equal((await p.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt: booking.startsAt, extra: 1 })).status, 400);
  });

  it("afviser en booking efter starttid, en aflyst og en reserveret akuttid", async () => {
    const started = await bookingAt(-HOUR);
    const late = await started.p.c.post(`/api/bookings/${started.id}/reschedule`, { startsAt: new Date(Date.now() + 5 * 24 * HOUR).toISOString() });
    assert.equal(late.status, 409);
    assert.equal(code(late), "BOOKING_NOT_RESCHEDULABLE");
    const lateSlots = await started.p.c.get(`/api/bookings/${started.id}/availability`);
    assert.equal(lateSlots.status, 409);
    assert.equal(code(lateSlots), "BOOKING_NOT_RESCHEDULABLE");

    const { p, booking } = await booked();
    assert.equal((await p.c.post(`/api/bookings/${booking.id}/cancel`, {})).status, 200);
    const cancelled = await p.c.get(`/api/bookings/${booking.id}/availability`);
    assert.equal(cancelled.status, 409);
    assert.equal(code(cancelled), "BOOKING_NOT_RESCHEDULABLE");
    const again = await p.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt: new Date(Date.now() + 5 * 24 * HOUR).toISOString() });
    assert.equal(again.status, 409);
    assert.equal(code(again), "BOOKING_NOT_RESCHEDULABLE");

    const k = await clinic();
    const held = await acceptedLead(k);
    const heldId = await insertBooking(held.leadId, k, held.p, new Date(Date.now() + 3 * HOUR), { status: "held" });
    const r = await held.p.c.post(`/api/bookings/${heldId}/reschedule`, { startsAt: new Date(Date.now() + 5 * 24 * HOUR).toISOString() });
    assert.equal(r.status, 409);
    assert.equal(code(r), "BOOKING_NOT_RESCHEDULABLE");
  });

  it("fremmed booking er 404, klinik 403, anonym kræver konto", async () => {
    const { k, booking } = await booked();
    const stranger = await patient();
    const startsAt = new Date(Date.now() + 5 * 24 * HOUR).toISOString();
    assert.equal((await stranger.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt })).status, 404);
    assert.equal((await stranger.c.get(`/api/bookings/${booking.id}/availability`)).status, 404);
    assert.equal((await k.c.post(`/api/bookings/${booking.id}/reschedule`, { startsAt })).status, 403);
    assert.equal((await k.c.get(`/api/bookings/${booking.id}/availability`)).status, 403);
    assert.equal((await (await newClientWithTerms()).post(`/api/bookings/${booking.id}/reschedule`, { startsAt })).status, 401);
  });

  it("ledige tider for en booking følger klinikkens og behandlingens regler (kvarter, 14 dage)", async () => {
    const { p, booking } = await booked();
    const r = await p.c.get(`/api/bookings/${booking.id}/availability`);
    assert.equal(r.status, 200);
    assert.ok(r.body.slots.length > 0);
    for (const slot of r.body.slots as { startsAt: string }[]) assert.equal(new Date(slot.startsAt).getTime() % (15 * MINUTE), 0);
    const from = new Date().toISOString();
    const far = new Date(Date.now() + 20 * 24 * HOUR).toISOString();
    assert.equal((await p.c.get(`/api/bookings/${booking.id}/availability?from=${from}&to=${far}`)).status, 400);
    // Den nuværende tid tilbydes ikke [PROTOTYPE].
    assert.ok(!(r.body.slots as { startsAt: string }[]).some((s) => s.startsAt === booking.startsAt));
  });
});
