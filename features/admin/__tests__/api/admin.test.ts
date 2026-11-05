// API-tests for admin (features/admin 10.14; RLS-punkt 60): klinikstatus og moderation af anmeldelser og svar.
// Kører mod en rigtig app + lokal Supabase. Brugere og klinikker er fiktive og ryddes til sidst. Admin-brugeren oprettes som
// scripts/create-admin.ts: signup som patient, derefter rolle admin og ingen patientrække (service role, kun lokalt).
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

assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^http:\/\/(127\.0\.0\.1|localhost):/, "kun lokal Supabase");

const service = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await service.auth.admin.deleteUser(id).catch(() => {});
});

const MINUTE = 60_000;
const HOUR = 3_600_000;
const REVIEW_TEXT = "Rolig og grundig behandling, og vi fik god information undervejs.";

type Clinic = { c: TestClient; id: string; name: string; email: string };
type Patient = { c: TestClient; caseId: string; userId: string; email: string; serviceId: string };

async function clinic(): Promise<Clinic> {
  const c = await newClientWithTerms();
  const name = `Admintest ${Math.random().toString(36).slice(2, 8)}`;
  const email = uniqueEmail("klinik");
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email,
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: name,
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const id = (await c.get("/api/me")).body.clinic.id as string;
  assert.ifError((await service.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "verified" })).error);
  return { c, id, name, email };
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

async function adminUser(): Promise<TestClient> {
  const c = await newClientWithTerms();
  const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail("admin"), password: PASSWORD, firstName: "Admin" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  assert.ifError((await service.from("profiles").update({ role: "admin" }).eq("id", s.body.userId)).error);
  assert.ifError((await service.from("patients").delete().eq("id", s.body.userId)).error);
  return c;
}

// Anmeldelse (pending) af en gennemført booking hos klinikken. Bookingen indsættes med service role, så den kan ligge i fortiden.
async function pendingReview(k: Clinic): Promise<{ p: Patient; reviewId: string }> {
  const p = await patient();
  const sent = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: [k.id] });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const leadId = sent.body.leads[0].id as string;
  assert.equal((await k.c.post(`/api/leads/${leadId}/decision`, { decision: "accept" })).status, 200);
  const starts = new Date(Math.floor((Date.now() - 30 * HOUR - 30 * MINUTE) / (15 * MINUTE)) * 15 * MINUTE);
  const { data, error } = await service
    .from("bookings")
    .insert({
      lead_id: leadId,
      clinic_id: k.id,
      patient_id: p.userId,
      service_id: p.serviceId,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 30 * MINUTE).toISOString(),
      status: "booked",
      contact_name: "Lea Testesen",
      contact_phone: "+45 12 34 56 78",
      contact_email: p.email,
    })
    .select("id")
    .single();
  assert.ifError(error);
  const r = await p.c.post("/api/reviews", { bookingId: data!.id, stars: 4, text: REVIEW_TEXT, priceAccuracy: "as_quoted", actualPrice: 900 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { p, reviewId: r.body.id as string };
}

const code = (r: { body: unknown }) => (r.body as { error?: { code: string } }).error?.code;
const fakeId = "00000000-0000-4000-8000-000000000000";

describe("admin: adgang", () => {
  it("patient og klinik får 403, anonym 403 og uden session 401", async () => {
    const k = await clinic();
    const p = await patient();
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    const none = await newClientWithTerms();
    const calls = (c: TestClient) => [
      c.get("/api/admin/clinics"),
      c.post(`/api/admin/clinics/${k.id}/status`, { status: "registered" }),
      c.get("/api/admin/moderation"),
      c.post(`/api/admin/moderation/review/${fakeId}`, { status: "approved" }),
    ];
    for (const r of await Promise.all(calls(p.c))) assert.equal(r.status, 403);
    for (const r of await Promise.all(calls(k.c))) assert.equal(r.status, 403);
    for (const r of await Promise.all(calls(anon))) {
      assert.equal(r.status, 403);
      assert.equal(code(r), "FORBIDDEN"); // rollen patient er ikke admin; rollen tjekkes før anonym-tjekket
    }
    for (const r of await Promise.all(calls(none))) assert.equal(r.status, 401);
    // Klinikken kunne ikke ændre noget.
    assert.equal((await k.c.get("/api/me")).body.clinic.status, "verified");
  });
});

describe("admin: klinikker", () => {
  it("lister og søger, sætter på pause, afviser ugyldige overgange og verificerer igen", async () => {
    const adm = await adminUser();
    const k = await clinic();
    const list = await adm.get(`/api/admin/clinics?q=${encodeURIComponent(k.name)}`);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.clinics.length, 1);
    const row = list.body.clinics[0];
    assert.equal(row.id, k.id);
    assert.equal(row.status, "verified");
    assert.equal(row.hasOwner, true);
    assert.equal(row.canPause, true);
    assert.equal(row.canVerify, false);
    assert.equal("ownerId" in row, false);
    assert.equal(row.ownerEmail, k.email, "ejerens login-e-mail vises (H1)");
    assert.equal((await adm.get(`/api/admin/clinics?q=${encodeURIComponent(k.name)}&status=imported`)).body.clinics.length, 0);
    assert.equal((await adm.get("/api/admin/clinics?status=bogus")).status, 400);
    // Søgetegn med betydning for filteret giver ingen fejl.
    assert.equal((await adm.get(`/api/admin/clinics?q=${encodeURIComponent('a,b)(%"')}`)).status, 200);

    assert.ok((await k.c.get(`/api/clinics/${k.id}`)).status === 200, "synlig i oversigten før pausen");
    const paused = await adm.post(`/api/admin/clinics/${k.id}/status`, { status: "registered", reason: "  Mangler dokumentation  " });
    assert.equal(paused.status, 200, JSON.stringify(paused.body));
    assert.equal(paused.body.status, "registered");
    assert.equal(paused.body.canVerify, true);
    assert.equal(paused.body.verifiedAt, null);
    const publicView = await (await newClientWithTerms()).get(`/api/clinics/${k.id}`);
    assert.equal(publicView.status, 404);
    const publicList = await (await newClientWithTerms()).get("/api/clinics");
    assert.ok(!JSON.stringify(publicList.body).includes(k.id), "pauset klinik er ikke i oversigten");

    const again = await adm.post(`/api/admin/clinics/${k.id}/status`, { status: "registered" });
    assert.equal(again.status, 409);
    assert.equal(code(again), "INVALID_STATUS_TRANSITION");
    assert.equal((await adm.post(`/api/admin/clinics/${k.id}/status`, { status: "imported" })).status, 400);
    assert.equal((await adm.post(`/api/admin/clinics/${fakeId}/status`, { status: "verified", reason: "Kontrolleret" })).status, 404);
    assert.equal((await adm.post("/api/admin/clinics/ikke-et-id/status", { status: "verified", reason: "Kontrolleret" })).status, 404);
    assert.equal((await adm.post(`/api/admin/clinics/${k.id}/status`, { status: "verified", reason: "x".repeat(501) })).status, 400);
    assert.equal((await adm.post(`/api/admin/clinics/${k.id}/status`, { status: "verified", reason: "Kontrolleret", extra: 1 })).status, 400);

    // H1: "Verificér" kræver en begrundelse.
    for (const body of [{ status: "verified" }, { status: "verified", reason: "   " }]) {
      const noReason = await adm.post(`/api/admin/clinics/${k.id}/status`, body);
      assert.equal(noReason.status, 400);
      assert.equal(code(noReason), "REASON_REQUIRED");
    }
    assert.equal((await adm.get(`/api/admin/clinics?q=${encodeURIComponent(k.name)}`)).body.clinics[0].status, "registered", "uændret efter afvisningerne");
    const verified = await adm.post(`/api/admin/clinics/${k.id}/status`, { status: "verified", reason: "CVR og ejer kontrolleret" });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.status, "verified");
    assert.ok(verified.body.verifiedAt);
    assert.equal((await (await newClientWithTerms()).get(`/api/clinics/${k.id}`)).status, 200);

    const { data: log } = await service.from("admin_actions").select("action, from_value, to_value, reason").eq("target_id", k.id).order("created_at");
    assert.deepEqual(log, [
      { action: "clinic_status", from_value: "verified", to_value: "registered", reason: "Mangler dokumentation" },
      { action: "clinic_status", from_value: "registered", to_value: "verified", reason: "CVR og ejer kontrolleret" },
    ]);
  });
});

describe("admin: moderation", () => {
  it("viser en pending anmeldelse uden patientoplysninger, og en godkendelse gør den offentlig", async () => {
    const adm = await adminUser();
    const k = await clinic();
    const { p, reviewId } = await pendingReview(k);
    const queue = await adm.get("/api/admin/moderation");
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    const item = queue.body.items.find((i: { id: string }) => i.id === reviewId);
    assert.ok(item, "anmeldelsen står i køen");
    assert.equal(item.kind, "review");
    assert.equal(item.clinic.id, k.id);
    assert.equal(item.clinic.name, k.name);
    assert.equal(item.moderationStatus, "pending");
    assert.equal(item.stars, 4);
    assert.equal(item.actualPrice, 900);
    const text = JSON.stringify(item);
    assert.ok(!text.includes(p.userId) && !text.includes("Lea") && !text.includes(p.email), "ingen patientoplysninger");
    assert.deepEqual(Object.keys(item).filter((key) => /patient|booking/i.test(key)), []);

    const before = await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`);
    assert.equal(before.body.reviews.length, 0);
    const approved = await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "approved" });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.moderationStatus, "approved");
    assert.ok(approved.body.moderatedAt);
    const after = await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`);
    assert.equal(after.body.reviews.length, 1);
    assert.equal(after.body.reviews[0].id, reviewId);
    assert.ok(!(await adm.get("/api/admin/moderation")).body.items.some((i: { id: string }) => i.id === reviewId), "ude af pending-køen");
    assert.ok((await adm.get("/api/admin/moderation?status=approved")).body.items.some((i: { id: string }) => i.id === reviewId));
  });

  it("afvisning kræver begrundelse, vises for patienten og fjerner anmeldelsen fra offentligheden", async () => {
    const adm = await adminUser();
    const k = await clinic();
    const { p, reviewId } = await pendingReview(k);
    const noReason = await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "rejected" });
    assert.equal(noReason.status, 400);
    assert.equal(code(noReason), "REASON_REQUIRED");
    assert.equal(code(await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "rejected", reason: "   " })), "REASON_REQUIRED");
    assert.equal((await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "pending" })).status, 400);
    assert.equal((await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "rejected", reason: "x".repeat(501) })).status, 400);

    const rejected = await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "rejected", reason: "Personoplysninger om andre" });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.rejectionReason, "Personoplysninger om andre");
    assert.equal((await p.c.get("/api/reviews/mine")).body.reviews[0].rejectionReason, "Personoplysninger om andre");
    assert.equal((await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`)).body.reviews.length, 0);

    // Også en godkendt anmeldelse kan afvises (og omvendt).
    assert.equal((await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "approved" })).status, 200);
    assert.equal((await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`)).body.reviews.length, 1);
    assert.equal((await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "rejected", reason: "Irrelevant indhold" })).status, 200);
    assert.equal((await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`)).body.reviews.length, 0);

    assert.equal((await adm.post(`/api/admin/moderation/review/${fakeId}`, { status: "approved" })).status, 404);
    assert.equal((await adm.post(`/api/admin/moderation/bogus/${reviewId}`, { status: "approved" })).status, 404);
    assert.equal((await adm.post(`/api/admin/moderation/review/ikke-et-id`, { status: "approved" })).status, 404);
    assert.equal((await adm.get("/api/admin/moderation?kind=bogus")).status, 400);
  });

  it("klinikkens svar: køen viser et uddrag, og godkendelsen gør svaret offentligt", async () => {
    const adm = await adminUser();
    const k = await clinic();
    const { reviewId } = await pendingReview(k);
    assert.equal((await adm.post(`/api/admin/moderation/review/${reviewId}`, { status: "approved" })).status, 200);
    const reply = await k.c.post(`/api/reviews/${reviewId}/reply`, { text: "Tak for besøget og de pæne ord." });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));

    const queue = await adm.get("/api/admin/moderation?kind=reply");
    const item = queue.body.items.find((i: { id: string }) => i.id === reply.body.id);
    assert.ok(item, "svaret står i køen");
    assert.equal(item.kind, "reply");
    assert.equal(item.reviewId, reviewId);
    assert.equal(item.text, "Tak for besøget og de pæne ord.");
    assert.equal(item.reviewExcerpt, REVIEW_TEXT);
    assert.equal((await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`)).body.reviews[0].reply, null);

    assert.equal((await adm.post(`/api/admin/moderation/reply/${reply.body.id}`, { status: "approved" })).status, 200);
    assert.equal((await (await newClientWithTerms()).get(`/api/clinics/${k.id}/reviews`)).body.reviews[0].reply.text, "Tak for besøget og de pæne ord.");
    const rejected = await adm.post(`/api/admin/moderation/reply/${reply.body.id}`, { status: "rejected", reason: "Injurierende indhold" });
    assert.equal(rejected.body.rejectionReason, "Injurierende indhold");
    assert.equal((await k.c.get("/api/clinics/me/reviews")).body.reviews[0].replyStatus, "rejected");
    // En anmeldelses id er ikke et svar.
    assert.equal((await adm.post(`/api/admin/moderation/reply/${reviewId}`, { status: "approved" })).status, 404);
  });
});
