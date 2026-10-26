// API-tests for billeder i beskedtråden (features/leads/README.md 4.3 `message_images`, 10.12). Kører mod en rigtig app +
// lokal Supabase. Klinikker og patienter er fiktive og ryddes til sidst.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_CONSENT_VERSION,
  PASSWORD,
  SHARING_CONSENT_VERSION,
  TestClient,
  adminClient,
  jpegWithExif,
  newClientWithTerms,
  randomCvr,
  uniqueEmail,
} from "../../../../tests/api/helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type Clinic = { c: TestClient; id: string };
type Patient = { c: TestClient; caseId: string; userId: string };
type Image = { id: string; url: string; width: number; height: number };
type Message = { id: string; fromMe: boolean; senderRole: string; body: string; images: Image[] };

async function clinic(): Promise<Clinic> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
    password: PASSWORD,
    cvr: randomCvr(),
    clinicName: "Billedbeskedtest Tandklinik",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    phone: "00 00 00 01",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  createdUserIds.add(r.body.userId);
  const id = (await c.get("/api/me")).body.clinic.id as string;
  assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: "verified" })).error);
  return { c, id };
}

// Patient med konto og en sendt-klar sag; `imageConsent` giver billedsamtykket (ellers kun delingssamtykket).
async function patient(imageConsent = true): Promise<Patient> {
  const c = await newClientWithTerms();
  const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Lea" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  const caseId = (await c.post("/api/cases")).body.id as string;
  const serviceId = (await c.get("/api/services")).body.groups[0].services[0].id as string;
  assert.equal((await c.put(`/api/cases/${caseId}/services`, { services: [{ serviceId, suggestedByAi: false }] })).status, 200);
  assert.equal((await c.patch(`/api/cases/${caseId}`, { postalCode: "2100", preferredTimeframe: "flexible" })).status, 200);
  assert.equal((await c.put(`/api/cases/${caseId}/summary`, { summaryText: "Jeg vil gerne have en tjekup." })).status, 200);
  assert.equal((await c.post("/api/consents", { type: "health_data_sharing", textVersion: SHARING_CONSENT_VERSION })).status, 201);
  if (imageConsent) assert.equal((await c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION })).status, 201);
  return { c, caseId, userId: s.body.userId };
}

async function send(p: Patient, clinics: Clinic[]): Promise<string[]> {
  const r = await p.c.post(`/api/cases/${p.caseId}/leads`, { clinicIds: clinics.map((k) => k.id) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return clinics.map((k) => r.body.leads.find((l: { clinic: { id: string } }) => l.clinic.id === k.id).id as string);
}

// Multipart med `count` billeder (eller de angivne filer) og valgfri tekst.
function form(files: Blob[], body?: string): FormData {
  const f = new FormData();
  if (body !== undefined) f.set("body", body);
  files.forEach((file, i) => f.append("file", file, `billede-${i + 1}.jpg`));
  return f;
}
async function jpegs(count: number): Promise<Blob[]> {
  const jpeg = new Uint8Array(await jpegWithExif());
  return Array.from({ length: count }, () => new Blob([jpeg], { type: "image/jpeg" }));
}

const code = (r: { body: { error?: { code: string } } }) => r.body.error?.code;

async function storedFiles(leadId: string): Promise<string[]> {
  const { data } = await admin.storage.from("case-images").list(`messages/${leadId}`);
  return (data ?? []).map((f) => f.name);
}

describe("billeder i beskedtråden", () => {
  it("patienten sender billeder med tekst; klinikken ser dem, en anden klinik ser intet", async () => {
    const p = await patient();
    const x = await clinic();
    const y = await clinic();
    const [leadX, leadY] = await send(p, [x, y]);
    const path = `/api/leads/${leadX}/messages`;

    const r = await p.c.postForm(path, form(await jpegs(2), "  Her er to billeder  "));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const sent = r.body as Message;
    assert.equal(sent.fromMe, true);
    assert.equal(sent.senderRole, "patient");
    assert.equal(sent.body, "Her er to billeder");
    assert.equal(sent.images.length, 2);
    assert.ok(sent.images.every((i) => i.url.includes("token=") && i.width === 64 && i.height === 64));
    assert.deepEqual(Object.keys(sent.images[0]).sort(), ["height", "id", "url", "width"], "kun signeret URL, ingen sti");
    assert.ok(!sent.images[0].url.includes(p.caseId), "hverken sags-id i stien eller URL'en");

    // Filen er genkodet uden EXIF.
    const file = await fetch(sent.images[0].url);
    assert.equal(file.status, 200);
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.ok(!bytes.includes(Buffer.from("hemmelig-ophavsret")), "EXIF er fjernet");
    assert.equal((await storedFiles(leadX)).length, 2);

    // Klinik X ser beskeden med billederne.
    const thread = await x.c.get(path);
    assert.equal(thread.status, 200);
    const [m] = thread.body.messages as Message[];
    assert.equal(m.fromMe, false);
    assert.equal(m.body, "Her er to billeder");
    assert.deepEqual(m.images.map((i) => i.id), sent.images.map((i) => i.id));
    assert.equal((await fetch(m.images[1].url)).status, 200);

    // Klinik Y har ikke adgang til X's tråd og har ingen billeder i sin egen.
    assert.equal((await y.c.get(path)).status, 404);
    assert.equal((await y.c.postForm(path, form(await jpegs(1)))).status, 404);
    assert.deepEqual((await y.c.get(`/api/leads/${leadY}/messages`)).body.messages, []);
  });

  it("klinikken sender et billede uden tekst og uden samtykke; patienten ser det", async () => {
    const p = await patient(false);
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    const r = await k.c.postForm(path, form(await jpegs(1)));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.body, "");
    assert.equal(r.body.senderRole, "clinic");
    const thread = await p.c.get(path);
    const [m] = thread.body.messages as Message[];
    assert.equal(m.fromMe, false);
    assert.equal(m.senderRole, "clinic");
    assert.equal(m.images.length, 1);
    assert.equal((await fetch(m.images[0].url)).status, 200);
    // En tekstbesked har en tom billedliste.
    const text = await p.c.post(path, { body: "Tak" });
    assert.equal(text.status, 201);
    assert.deepEqual(text.body.images, []);
  });

  it("patienten uden billedsamtykke får 403 CONSENT_REQUIRED, og intet gemmes", async () => {
    const p = await patient(false);
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const r = await p.c.postForm(`/api/leads/${leadId}/messages`, form(await jpegs(1), "Se her"));
    assert.equal(r.status, 403);
    assert.equal(code(r), "CONSENT_REQUIRED");
    assert.deepEqual(await storedFiles(leadId), []);
    assert.deepEqual((await p.c.get(`/api/leads/${leadId}/messages`)).body.messages, []);
  });

  it("validering: for mange billeder, forkert filtype, intet billede og for lang tekst giver 400", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    const tooMany = await p.c.postForm(path, form(await jpegs(4)));
    assert.equal(tooMany.status, 400);
    assert.equal(code(tooMany), "IMAGE_LIMIT");
    const wrongType = await p.c.postForm(path, form([new Blob(["ikke et billede"], { type: "image/jpeg" })]));
    assert.equal(wrongType.status, 400);
    assert.equal(code(wrongType), "INVALID_IMAGE");
    const none = await p.c.postForm(path, form([], "Kun tekst som formular"));
    assert.equal(none.status, 400);
    assert.equal(code(none), "MISSING_FILE");
    const long = await k.c.postForm(path, form(await jpegs(1), "x".repeat(2001)));
    assert.equal(long.status, 400);
    assert.equal(code(long), "VALIDATION_ERROR");
    assert.deepEqual(await storedFiles(leadId), [], "intet er gemt");
    // En tom tekstbesked som JSON afvises stadig.
    assert.equal((await p.c.post(path, { body: "   " })).status, 400);
  });

  it("lukket tråd: 409 ved declined og withdrawn, og klinikken ser ingen billeder efter tilbagetrækning", async () => {
    const p = await patient();
    const x = await clinic();
    const y = await clinic();
    const [leadX, leadY] = await send(p, [x, y]);

    assert.equal((await x.c.postForm(`/api/leads/${leadX}/messages`, form(await jpegs(1), "Fra klinikken"))).status, 201);
    assert.equal((await p.c.postForm(`/api/leads/${leadX}/messages`, form(await jpegs(1)))).status, 201);
    assert.equal((await p.c.post(`/api/leads/${leadX}/withdraw`)).status, 200);
    const patientClosed = await p.c.postForm(`/api/leads/${leadX}/messages`, form(await jpegs(1)));
    assert.equal(patientClosed.status, 409);
    assert.equal(code(patientClosed), "THREAD_CLOSED");
    const clinicClosed = await x.c.postForm(`/api/leads/${leadX}/messages`, form(await jpegs(1)));
    assert.equal(clinicClosed.status, 409);
    assert.equal(code(clinicClosed), "THREAD_CLOSED");
    assert.deepEqual((await x.c.get(`/api/leads/${leadX}/messages`)).body.messages, [], "klinikken ser hverken beskeder eller billeder");
    const own = (await p.c.get(`/api/leads/${leadX}/messages`)).body.messages as Message[];
    assert.equal(own.flatMap((m) => m.images).length, 2, "patienten ser stadig tråden med billeder");

    assert.equal((await y.c.post(`/api/leads/${leadY}/decision`, { decision: "decline", reason: "other" })).status, 200);
    const declined = await y.c.postForm(`/api/leads/${leadY}/messages`, form(await jpegs(1)));
    assert.equal(declined.status, 409);
    assert.equal(code(declined), "THREAD_CLOSED");
  });

  it("tilbagetrækning af billedsamtykket sletter patientens beskedbilleder, ikke klinikkens", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    const path = `/api/leads/${leadId}/messages`;
    assert.equal((await p.c.postForm(path, form(await jpegs(2)))).status, 201);
    assert.equal((await k.c.postForm(path, form(await jpegs(1), "Her er et eksempel"))).status, 201);
    assert.equal((await storedFiles(leadId)).length, 3);

    const consents = await p.c.get("/api/consents");
    const consentId = consents.body.consents.find((c: { type: string; withdrawnAt: string | null }) => c.type === "image_upload" && !c.withdrawnAt).id;
    const w = await p.c.post(`/api/consents/${consentId}/withdraw`);
    assert.equal(w.status, 200, JSON.stringify(w.body));

    assert.equal((await storedFiles(leadId)).length, 1, "kun klinikkens fil er tilbage");
    const thread = (await k.c.get(path)).body.messages as Message[];
    assert.equal(thread.length, 2, "beskederne består");
    assert.deepEqual(thread[0].images, [], "patientens billeder er væk for klinikken");
    assert.equal(thread[1].images.length, 1);
    const again = await p.c.postForm(path, form(await jpegs(1)));
    assert.equal(again.status, 403);
    assert.equal(code(again), "CONSENT_REQUIRED");
  });

  it("kontosletning sletter billedfilerne i patientens tråde", async () => {
    const p = await patient();
    const k = await clinic();
    const [leadId] = await send(p, [k]);
    assert.equal((await p.c.postForm(`/api/leads/${leadId}/messages`, form(await jpegs(1)))).status, 201);
    assert.equal((await k.c.postForm(`/api/leads/${leadId}/messages`, form(await jpegs(1)))).status, 201);
    assert.equal((await storedFiles(leadId)).length, 2);
    const r = await p.c.del("/api/patients/me", { confirm: "SLET" });
    assert.equal(r.status, 204, JSON.stringify(r.body));
    createdUserIds.delete(p.userId);
    assert.deepEqual(await storedFiles(leadId), []);
    const { count } = await admin.from("message_images").select("id", { count: "exact", head: true }).eq("lead_id", leadId);
    assert.equal(count, 0);
  });

  it("anonym og uden session kan ikke sende billeder", async () => {
    const c = new TestClient();
    const r = await c.postForm(`/api/leads/${crypto.randomUUID()}/messages`, form(await jpegs(1)));
    assert.ok([401, 403].includes(r.status), String(r.status));
  });
});
