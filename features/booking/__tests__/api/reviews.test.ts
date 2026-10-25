// API-tests for 6.2: anmeldelser, svar, klinikkens visning, offentlig visning og eksport (architecture 8, 10.13, 12.3 punkt 32).
// Kører mod en rigtig app + lokal Supabase (run.sh afviser alt andet end localhost). Klinikker og patienter er fiktive og
// ryddes til sidst. Bookinger indsættes med service role, så starttiden kan ligge i fortiden; godkendelse (moderation) sker
// også med service role, fordi der ikke er nogen adminside (8.5).
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
const TEXT = "Rolig og grundig behandling, og vi fik god information undervejs.";

type Clinic = { c: TestClient; id: string; userId: string };
type Patient = { c: TestClient; caseId: string; userId: string; email: string; serviceId: string };

async function clinic(verified = true): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Anmeldelsestest Tandklinik",
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
  if (verified) assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "verified" })).error);
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

// Sendt og accepteret lead.
async function acceptedLead(k: Clinic, p?: Patient): Promise<{ p: Patient; leadId: string }> {
  const patientHere = p ?? (await patient());
  const sent = await patientHere.c.post(`/api/cases/${patientHere.caseId}/leads`, { clinicIds: [k.id] });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const leadId = sent.body.leads[0].id as string;
  const r = await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { p: patientHere, leadId };
}

function quarter(ms: number): Date {
  return new Date(Math.floor(ms / (15 * MINUTE)) * 15 * MINUTE);
}

// Booking på 30 minutter, der sluttede `endedHoursAgo` timer før nu. Indsat med service role; leadet sættes til booked.
async function insertBooking(
  leadId: string,
  k: Clinic,
  p: Patient,
  endedHoursAgo: number,
  status: "booked" | "cancelled" = "booked",
): Promise<string> {
  const starts = quarter(Date.now() - endedHoursAgo * HOUR - 30 * MINUTE);
  const { data, error } = await admin
    .from("bookings")
    .insert({
      lead_id: leadId,
      clinic_id: k.id,
      patient_id: p.userId,
      service_id: p.serviceId,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 30 * MINUTE).toISOString(),
      status,
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

// En gennemført booking (sluttede for 30 timer siden) hos klinikken; `extraHours` flytter den, så flere ikke overlapper.
async function completedBooking(k: Clinic, extraHours = 0) {
  const { p, leadId } = await acceptedLead(k);
  const bookingId = await insertBooking(leadId, k, p, 30 + extraHours);
  return { p, leadId, bookingId };
}

const reviewBody = (bookingId: string, extra: Record<string, unknown> = {}) => ({
  bookingId,
  stars: 5,
  text: TEXT,
  priceAccuracy: "as_quoted",
  ...extra,
});

async function approve(table: "reviews" | "review_replies", id: string) {
  const { error } = await admin
    .from(table)
    .update({ moderation_status: "approved", moderated_at: new Date().toISOString() })
    .eq("id", id);
  assert.ifError(error);
}

function code(r: { body: { error?: { code: string } } }) {
  return r.body.error?.code;
}

describe("oprettelse af anmeldelse", () => {
  it("afviser før fristen (24 timer efter sluttid), og besøget er ikke i eligible", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const bookingId = await insertBooking(leadId, k, p, 23);
    const r = await p.c.post("/api/reviews", reviewBody(bookingId));
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(code(r), "REVIEW_NOT_ALLOWED");
    assert.deepEqual((await p.c.get("/api/reviews/eligible")).body.items, []);
    const booking = (await p.c.get("/api/bookings")).body.bookings[0];
    assert.equal(booking.canReview, false);
  });

  it("lykkes efter fristen: pending, klinikken udledes, canReview bliver falsk", async () => {
    const k = await clinic();
    const { p, bookingId } = await completedBooking(k);
    assert.equal((await p.c.get("/api/bookings")).body.bookings[0].canReview, true);
    const r = await p.c.post("/api/reviews", reviewBody(bookingId, { stars: 4, actualPrice: 1200, lackedTransparency: true, transparencyComment: "  Uklart om røntgen var med.  " }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.moderationStatus, "pending");
    assert.deepEqual(Object.keys(r.body).sort(), ["id", "moderationStatus"]);
    const { data } = await admin.from("reviews").select("clinic_id, patient_id, transparency_comment").eq("id", r.body.id).single();
    assert.equal(data!.clinic_id, k.id);
    assert.equal(data!.patient_id, p.userId);
    assert.equal(data!.transparency_comment, "Uklart om røntgen var med.");
    assert.equal((await p.c.get("/api/bookings")).body.bookings[0].canReview, false);
    assert.deepEqual((await p.c.get("/api/reviews/eligible")).body.items, []);
  });

  it("ignorerer ikke en ukendt klinik: clinicId i body afvises", async () => {
    const k = await clinic();
    const { p, bookingId } = await completedBooking(k);
    const other = await clinic();
    const r = await p.c.post("/api/reviews", { ...reviewBody(bookingId), clinicId: other.id });
    assert.equal(r.status, 400);
  });

  it("udeblivelse blokerer", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const bookingId = await insertBooking(leadId, k, p, 30);
    assert.ifError((await admin.from("bookings").update({ status: "no_show", no_show_at: new Date().toISOString() }).eq("id", bookingId)).error);
    const r = await p.c.post("/api/reviews", reviewBody(bookingId));
    assert.equal(r.status, 403);
    assert.equal(code(r), "REVIEW_NOT_ALLOWED");
    assert.deepEqual((await p.c.get("/api/reviews/eligible")).body.items, []);
  });

  it("en aflyst booking kan ikke anmeldes", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const bookingId = await insertBooking(leadId, k, p, 30, "cancelled");
    assert.equal((await p.c.post("/api/reviews", reviewBody(bookingId))).status, 403);
  });

  it("en ikke-verificeret klinik kan ikke anmeldes", async () => {
    const k = await clinic();
    const { p, bookingId } = await completedBooking(k);
    assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: k.id, p_status: "registered" })).error);
    const r = await p.c.post("/api/reviews", reviewBody(bookingId));
    assert.equal(r.status, 403);
    assert.equal(code(r), "REVIEW_NOT_ALLOWED");
  });

  it("dobbelt anmeldelse giver 409", async () => {
    const k = await clinic();
    const { p, bookingId } = await completedBooking(k);
    assert.equal((await p.c.post("/api/reviews", reviewBody(bookingId))).status, 201);
    const again = await p.c.post("/api/reviews", reviewBody(bookingId, { stars: 1 }));
    assert.equal(again.status, 409);
    assert.equal(code(again), "ALREADY_REVIEWED");
    const { count } = await admin.from("reviews").select("id", { count: "exact", head: true }).eq("booking_id", bookingId);
    assert.equal(count, 1);
  });

  it("afviser en fremmed eller ukendt booking, klinikker og anonyme", async () => {
    const k = await clinic();
    const { bookingId } = await completedBooking(k);
    const stranger = await patient();
    const foreign = await stranger.c.post("/api/reviews", reviewBody(bookingId));
    assert.equal(foreign.status, 403);
    assert.equal(code(foreign), "REVIEW_NOT_ALLOWED");
    const { count } = await admin.from("reviews").select("id", { count: "exact", head: true }).eq("booking_id", bookingId);
    assert.equal(count, 0);
    const unknown = await stranger.c.post("/api/reviews", reviewBody("00000000-0000-4000-8000-000000000000"));
    assert.equal(unknown.status, 404);
    assert.equal((await k.c.post("/api/reviews", reviewBody(bookingId))).status, 403);
    const anon = await newClientWithTerms();
    await anon.startAnonymous();
    assert.equal((await anon.post("/api/reviews", reviewBody(bookingId))).status, 403);
    assert.equal((await (await newClientWithTerms()).post("/api/reviews", reviewBody(bookingId))).status, 401);
  });

  it("validerer feltlængder og værdier", async () => {
    const k = await clinic();
    const { p, bookingId } = await completedBooking(k);
    const bad: Record<string, unknown>[] = [
      { text: "for kort" },
      { text: "x".repeat(2001) },
      { stars: 0 },
      { stars: 6 },
      { stars: 3.5 },
      { priceAccuracy: "lower" },
      { actualPrice: -1 },
      { actualPrice: 12.5 },
      { actualPrice: 1_000_001 },
      { transparencyComment: "x".repeat(501) },
      { lackedTransparency: "ja" },
    ];
    for (const extra of bad) {
      const r = await p.c.post("/api/reviews", reviewBody(bookingId, extra));
      assert.equal(r.status, 400, JSON.stringify(extra));
    }
    assert.equal((await p.c.post("/api/reviews", { ...reviewBody(bookingId), bookingId: "ikke-et-id" })).status, 400);
    // grænseværdierne er gyldige
    const ok = await p.c.post("/api/reviews", reviewBody(bookingId, { text: "x".repeat(20), stars: 1, priceAccuracy: "much_higher", actualPrice: 0 }));
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
  });
});

describe("eligible: prisoverslag", () => {
  it("bruger listeprisen, og den præciserede pris når klinikken har givet en", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const bookingId = await insertBooking(leadId, k, p, 30);
    assert.ifError((await admin.from("leads").update({ list_price_min: 800, list_price_max: 1000, quoted_price_min: null, quoted_price_max: null }).eq("id", leadId)).error);
    const list = (await p.c.get("/api/reviews/eligible")).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].bookingId, bookingId);
    assert.equal(list[0].clinicId, k.id);
    assert.equal(list[0].clinicName, "Anmeldelsestest Tandklinik");
    assert.ok(list[0].serviceName.length > 0);
    assert.match(list[0].visitedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(list[0].priceEstimate, { min: 800, max: 1000 });

    assert.ifError((await admin.from("leads").update({ quoted_price_min: 1100, quoted_price_max: 1300 }).eq("id", leadId)).error);
    assert.deepEqual((await p.c.get("/api/reviews/eligible")).body.items[0].priceEstimate, { min: 1100, max: 1300 });

    assert.ifError((await admin.from("leads").update({ list_price_min: null, list_price_max: null, quoted_price_min: null, quoted_price_max: null }).eq("id", leadId)).error);
    assert.equal((await p.c.get("/api/reviews/eligible")).body.items[0].priceEstimate, null);
  });

  it("kræver en patient med konto og viser kun egne besøg", async () => {
    const k = await clinic();
    await completedBooking(k);
    const stranger = await patient();
    assert.deepEqual((await stranger.c.get("/api/reviews/eligible")).body.items, []);
    assert.equal((await k.c.get("/api/reviews/eligible")).status, 403);
    const anon = await newClientWithTerms();
    await anon.startAnonymous();
    assert.equal((await anon.get("/api/reviews/eligible")).status, 403);
    assert.equal((await (await newClientWithTerms()).get("/api/reviews/eligible")).status, 401);
  });
});

describe("mine: egne anmeldelser med status", () => {
  it("viser pending, afvist med grund og godkendt med godkendt svar, kun egne", async () => {
    const k = await clinic();
    const { p, leadId } = await acceptedLead(k);
    const first = await insertBooking(leadId, k, p, 30);
    const created = await p.c.post("/api/reviews", reviewBody(first));
    assert.equal(created.status, 201);

    let mine = (await p.c.get("/api/reviews/mine")).body.reviews;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].id, created.body.id);
    assert.equal(mine[0].bookingId, first);
    assert.equal(mine[0].moderationStatus, "pending");
    assert.equal(mine[0].rejectionReason, null);
    assert.deepEqual(mine[0].clinic, { id: k.id, name: "Anmeldelsestest Tandklinik" });
    assert.equal(mine[0].stars, 5);
    assert.equal(mine[0].verifiedVisit, true);
    assert.match(mine[0].createdMonth, /^\d{4}-\d{2}$/);
    assert.equal(mine[0].reply, null);

    assert.ifError(
      (await admin.from("reviews").update({ moderation_status: "rejected", rejection_reason: "Indeholder personoplysninger." }).eq("id", created.body.id)).error,
    );
    mine = (await p.c.get("/api/reviews/mine")).body.reviews;
    assert.equal(mine[0].moderationStatus, "rejected");
    assert.equal(mine[0].rejectionReason, "Indeholder personoplysninger.");

    await approve("reviews", created.body.id);
    assert.ifError((await admin.from("reviews").update({ rejection_reason: null }).eq("id", created.body.id)).error);
    const reply = await k.c.post(`/api/reviews/${created.body.id}/reply`, { text: "Tak for besøget." });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal((await p.c.get("/api/reviews/mine")).body.reviews[0].reply, null, "ikke-godkendt svar vises ikke for patienten");
    await approve("review_replies", reply.body.id);
    const withReply = (await p.c.get("/api/reviews/mine")).body.reviews[0];
    assert.equal(withReply.moderationStatus, "approved");
    assert.equal(withReply.reply.text, "Tak for besøget.");

    const stranger = await patient();
    assert.deepEqual((await stranger.c.get("/api/reviews/mine")).body.reviews, []);
    assert.equal((await k.c.get("/api/reviews/mine")).status, 403);
  });
});

describe("klinikkens svar og visning", () => {
  it("svar kun på en godkendt anmeldelse af egen klinik, ét svar", async () => {
    const k = await clinic();
    const { p, bookingId } = await completedBooking(k);
    const created = (await p.c.post("/api/reviews", reviewBody(bookingId))).body;
    const url = `/api/reviews/${created.id}/reply`;

    const pending = await k.c.post(url, { text: "Tak." });
    assert.equal(pending.status, 404, "pending er usynlig for klinikken");
    assert.equal((await k.c.get("/api/clinics/me/reviews")).body.reviews.length, 0);

    await approve("reviews", created.id);
    const listed = (await k.c.get("/api/clinics/me/reviews")).body.reviews;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);
    assert.equal(listed[0].reply, null);
    assert.equal(listed[0].replyStatus, null);
    assert.ok(!JSON.stringify(listed).includes(p.userId), "ingen patient-id til klinikken");
    assert.ok(!JSON.stringify(listed).includes(p.email));

    const stranger = await clinic();
    assert.equal((await stranger.c.post(url, { text: "Tak." })).status, 404);
    assert.equal((await stranger.c.get("/api/clinics/me/reviews")).body.reviews.length, 0);
    assert.equal((await p.c.post(url, { text: "Tak." })).status, 403, "patienter kan ikke svare");

    assert.equal((await k.c.post(url, { text: "" })).status, 400);
    assert.equal((await k.c.post(url, { text: "x".repeat(1001) })).status, 400);
    assert.equal((await k.c.post(url, { text: "Tak.", clinicId: stranger.id })).status, 400);
    assert.equal((await k.c.post("/api/reviews/ikke-et-id/reply", { text: "Tak." })).status, 404);
    assert.equal((await k.c.post("/api/reviews/00000000-0000-4000-8000-000000000000/reply", { text: "Tak." })).status, 404);

    const reply = await k.c.post(url, { text: "  Tak for din anmeldelse.  " });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal(reply.body.moderationStatus, "pending");
    const again = await k.c.post(url, { text: "Endnu et svar." });
    assert.equal(again.status, 409);
    assert.equal(code(again), "ALREADY_REPLIED");

    const after = (await k.c.get("/api/clinics/me/reviews")).body.reviews[0];
    assert.equal(after.reply.text, "Tak for din anmeldelse.");
    assert.equal(after.replyStatus, "pending");
    // Offentligt vises svaret først, når det er godkendt.
    assert.equal((await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`)).body.reviews[0].reply, null);
    await approve("review_replies", reply.body.id);
    assert.equal((await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`)).body.reviews[0].reply.text, "Tak for din anmeldelse.");
    assert.equal((await k.c.get("/api/clinics/me/reviews")).body.reviews[0].replyStatus, "approved");
  });

  it("en ikke-verificeret klinik får 403, og patienter kan ikke bruge klinikruten", async () => {
    const k = await clinic(false);
    assert.equal((await k.c.get("/api/clinics/me/reviews")).status, 403);
    assert.equal(code(await k.c.get("/api/clinics/me/reviews")), "CLINIC_NOT_VERIFIED");
    assert.equal(code(await k.c.post("/api/reviews/00000000-0000-4000-8000-000000000000/reply", { text: "Tak." })), "CLINIC_NOT_VERIFIED");
    const p = await patient();
    assert.equal((await p.c.get("/api/clinics/me/reviews")).status, 403);
  });
});

// 12.3 punkt 32: en godkendt anmeldelse gennem API'et.
describe("offentlig visning og prisnøjagtighed", () => {
  it("en anmeldelse er først offentlig og tæller med, når den er godkendt", async () => {
    const k = await clinic();
    const visitor = await newClientWithTerms();
    const accuracies = ["as_quoted", "slightly_higher", "much_higher"] as const;
    const ids: string[] = [];
    for (const [index, priceAccuracy] of accuracies.entries()) {
      const { p, bookingId } = await completedBooking(k, index);
      const r = await p.c.post("/api/reviews", reviewBody(bookingId, { stars: 5 - index, priceAccuracy }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      ids.push(r.body.id);
    }

    const before = await visitor.get(`/api/clinics/${k.id}/reviews`);
    assert.equal(before.status, 200);
    assert.deepEqual(before.body.reviews, []);
    assert.equal(before.body.stats.reviewCount, 0);
    assert.equal(before.body.stats.priceAccuracyPct, null);

    await approve("reviews", ids[0]);
    const one = (await visitor.get(`/api/clinics/${k.id}/reviews`)).body;
    assert.equal(one.reviews.length, 1);
    assert.equal(one.reviews[0].id, ids[0]);
    assert.equal(one.reviews[0].verifiedVisit, true);
    assert.equal(one.reviews[0].text, TEXT);
    assert.deepEqual(Object.keys(one.reviews[0]).sort(), [
      "actualPrice", "createdMonth", "id", "lackedTransparency", "priceAccuracy", "reply", "stars", "text", "transparencyComment", "verifiedVisit",
    ]);
    assert.equal(one.stats.reviewCount, 1);
    assert.equal(one.stats.priceAccuracyPct, null, "under 3 anmeldelser vises ingen prisnøjagtighed");

    await approve("reviews", ids[1]);
    await approve("reviews", ids[2]);
    const all = (await visitor.get(`/api/clinics/${k.id}/reviews`)).body;
    assert.equal(all.reviews.length, 3);
    assert.equal(all.stats.reviewCount, 3);
    assert.equal(all.stats.avgStars, 4);
    assert.deepEqual(all.stats.distribution, { asQuoted: 1, slightlyHigher: 1, muchHigher: 1 });
    // round(100 * (1 * 1.0 + 1 * 0.5 + 1 * 0.0) / 3) = 50
    assert.equal(all.stats.priceAccuracyPct, 50);

    const profile = (await visitor.get(`/api/clinics/${k.id}`)).body;
    assert.equal(profile.reviewStats.reviewCount, 3);
    assert.equal(profile.reviewStats.priceAccuracyPct, 50);
    const list = (await visitor.get(`/api/clinics?ids=${k.id}`)).body.clinics[0];
    assert.equal(list.reviewStats.priceAccuracyPct, 50);
    assert.equal(list.reviewStats.avgStars, 4);
  });
});

describe("dataeksport", () => {
  it("indeholder patientens egne anmeldelser, ikke andres", async () => {
    const k = await clinic();
    const mine = await completedBooking(k);
    const other = await completedBooking(k, 2);
    const created = await mine.p.c.post("/api/reviews", reviewBody(mine.bookingId, { actualPrice: 900 }));
    await other.p.c.post("/api/reviews", reviewBody(other.bookingId, { text: "Anden patients anmeldelse, som ikke må i min eksport." }));

    const r = await mine.p.c.get("/api/patients/me/export");
    assert.equal(r.status, 200);
    assert.equal(r.body.reviews.length, 1);
    const entry = r.body.reviews[0];
    assert.equal(entry.id, created.body.id);
    assert.equal(entry.bookingId, mine.bookingId);
    assert.equal(entry.clinicId, k.id);
    assert.equal(entry.stars, 5);
    assert.equal(entry.text, TEXT);
    assert.equal(entry.priceAccuracy, "as_quoted");
    assert.equal(entry.actualPrice, 900);
    assert.equal(entry.moderationStatus, "pending");
    assert.equal(entry.rejectionReason, null);
    assert.ok(typeof entry.createdAt === "string");
    assert.ok(!JSON.stringify(r.body.reviews).includes("Anden patients"));
    const anon = await newClientWithTerms();
    await anon.startAnonymous();
    assert.deepEqual((await anon.get("/api/patients/me/export")).body.reviews, []);
  });
});
