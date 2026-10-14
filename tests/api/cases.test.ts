// API-tests for trin 3.1: sager, bekræftede ydelser, billeder og lukning/sletning (architecture 9.3, 10.5).
// Kører mod en rigtig app + lokal Supabase. Anonyme og permanente patienter oprettes pr. test og ryddes til sidst.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  IMAGE_CONSENT_VERSION,
  PASSWORD,
  TestClient,
  adminClient,
  imageForm,
  jpegWithExif,
  newClientWithTerms,
  uniqueEmail,
} from "./helpers.ts";

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type Patient = { c: TestClient; caseId: string; userId: string };

async function anonymous(): Promise<Patient> {
  const c = await newClientWithTerms();
  const r = await c.startAnonymous();
  assert.equal(r.status, 201);
  const me = await c.get("/api/me");
  createdUserIds.add(me.body.id);
  return { c, caseId: r.body.caseId, userId: me.body.id };
}

// Permanent patient med en ny sag (POST /api/cases).
async function account(): Promise<Patient> {
  const c = await newClientWithTerms();
  const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Sag" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  const created = await c.post("/api/cases");
  assert.equal(created.status, 201);
  return { c, caseId: created.body.id, userId: s.body.userId };
}

async function giveImageConsent(c: TestClient) {
  const r = await c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION });
  assert.equal(r.status, 201);
  return r.body.id as string;
}

async function serviceIds(c: TestClient, count: number): Promise<string[]> {
  const r = await c.get("/api/services");
  const ids = r.body.groups.flatMap((g: { services: { id: string }[] }) => g.services.map((s) => s.id));
  assert.ok(ids.length >= count);
  return ids.slice(0, count);
}

async function storedFiles(caseId: string): Promise<string[]> {
  const { data } = await admin.storage.from("case-images").list(caseId);
  return (data ?? []).map((f) => f.name);
}

describe("sag: opret, læs og redigér kladde", () => {
  it("konto kan oprette sager og se dem i oversigten; anonym kan ikke oprette flere", async () => {
    const p = await account();
    const second = await p.c.post("/api/cases");
    assert.equal(second.status, 201);
    assert.notEqual(second.body.id, p.caseId);
    assert.equal(second.body.status, "draft");
    assert.deepEqual(second.body.images, []);
    assert.equal(second.body.canSend, false);
    const list = await p.c.get("/api/cases");
    assert.equal(list.status, 200);
    assert.equal(list.body.cases.length, 2);

    const anon = await anonymous();
    const r = await anon.c.post("/api/cases");
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "ANONYMOUS_NOT_ALLOWED");
    assert.equal((await anon.c.get("/api/cases")).status, 403);
  });

  it("anonym patient læser og redigerer egen kladde", async () => {
    const { c, caseId } = await anonymous();
    const got = await c.get(`/api/cases/${caseId}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.status, "draft");
    assert.equal(got.body.postalCode, null);
    assert.equal(got.body.hasConversation, false);

    const patched = await c.patch(`/api/cases/${caseId}`, { postalCode: "2100", preferredTimeframe: "within_2_weeks" });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.postalCode, "2100");
    assert.equal(patched.body.preferredTimeframe, "within_2_weeks");

    const empty = await c.patch(`/api/cases/${caseId}`, {});
    assert.equal(empty.status, 200);
    assert.equal(empty.body.postalCode, "2100");
  });

  it("validerer input og afviser ukendte felter", async () => {
    const { c, caseId } = await anonymous();
    for (const body of [
      { postalCode: "12" },
      { postalCode: "abcd" },
      { preferredTimeframe: "i_morgen" },
      { status: "closed" },
      { summaryText: "snyd" },
    ]) {
      const r = await c.patch(`/api/cases/${caseId}`, body);
      assert.equal(r.status, 400, JSON.stringify(body));
    }
    assert.equal((await c.get(`/api/cases/${caseId}`)).body.status, "draft");
  });

  it("ugyldigt id giver 404, og login er påkrævet", async () => {
    const { c } = await anonymous();
    assert.equal((await c.get("/api/cases/ikke-et-id")).status, 404);
    assert.equal((await c.get(`/api/cases/${randomUUID()}`)).status, 404);
    const fresh = await newClientWithTerms();
    assert.equal((await fresh.get(`/api/cases/${randomUUID()}`)).status, 401);
  });
});

describe("sag: bekræftede ydelser", () => {
  it("bekræfter, erstatter og viser ydelser; sporer suggestedByAi", async () => {
    const { c, caseId } = await anonymous();
    const [a, b, d] = await serviceIds(c, 3);
    const first = await c.put(`/api/cases/${caseId}/services`, {
      services: [
        { serviceId: a, suggestedByAi: true },
        { serviceId: b, suggestedByAi: false },
      ],
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.services.length, 2);
    const flags = Object.fromEntries(first.body.services.map((s: { id: string; suggestedByAi: boolean }) => [s.id, s.suggestedByAi]));
    assert.deepEqual(flags, { [a]: true, [b]: false });

    const second = await c.put(`/api/cases/${caseId}/services`, {
      services: [
        { serviceId: b, suggestedByAi: false },
        { serviceId: d, suggestedByAi: false },
      ],
    });
    assert.equal(second.status, 200);
    assert.deepEqual(second.body.services.map((s: { id: string }) => s.id).sort(), [b, d].sort());
    assert.equal((await c.get(`/api/cases/${caseId}`)).body.services.length, 2);
  });

  it("afviser ukendte, dublerede, tomme og for mange ydelser", async () => {
    const { c, caseId } = await anonymous();
    const ids = await serviceIds(c, 6);
    const put = (services: unknown) => c.put(`/api/cases/${caseId}/services`, { services });

    const unknown = await put([{ serviceId: randomUUID(), suggestedByAi: false }]);
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, "UNKNOWN_SERVICE");
    assert.equal((await put([])).status, 400);
    assert.equal((await put([{ serviceId: ids[0], suggestedByAi: false }, { serviceId: ids[0], suggestedByAi: false }])).status, 400);
    assert.equal((await put(ids.map((serviceId) => ({ serviceId, suggestedByAi: false })))).status, 400);
    assert.equal((await put([{ serviceId: ids[0] }])).status, 400);
    assert.equal((await c.get(`/api/cases/${caseId}`)).body.services.length, 0);
  });

  it("canSend kræver opsummering, postnummer, tidsrum og ydelse (opsummering mangler, så false)", async () => {
    const { c, caseId } = await anonymous();
    const [a] = await serviceIds(c, 1);
    await c.patch(`/api/cases/${caseId}`, { postalCode: "2100", preferredTimeframe: "asap" });
    const r = await c.put(`/api/cases/${caseId}/services`, { services: [{ serviceId: a, suggestedByAi: false }] });
    assert.equal(r.body.canSend, false);
  });
});

describe("billeder", () => {
  it("uden samtykke: 403 CONSENT_REQUIRED, og filen læses ikke", async () => {
    const { c, caseId } = await anonymous();
    // Hverken fil eller multipart: hvis serveren læste filen først, ville svaret være 400 INVALID_FORM/MISSING_FILE.
    const r = await c.post(`/api/cases/${caseId}/images`, { ikke: "multipart" });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "CONSENT_REQUIRED");
    const withFile = await c.postForm(`/api/cases/${caseId}/images`, imageForm(await jpegWithExif()));
    assert.equal(withFile.status, 403);
    assert.deepEqual(await storedFiles(caseId), []);
  });

  it("tilbagetrukket og forældet samtykke giver ikke adgang", async () => {
    const { c, caseId } = await anonymous();
    const consentId = await giveImageConsent(c);
    await c.post(`/api/consents/${consentId}/withdraw`);
    const r = await c.postForm(`/api/cases/${caseId}/images`, imageForm(await jpegWithExif()));
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "CONSENT_REQUIRED");
  });

  it("upload fjerner EXIF, gemmer under {case_id}/{image_id}.jpg og giver signeret URL", async () => {
    const { c, caseId, userId } = await anonymous();
    await giveImageConsent(c);
    const original = await jpegWithExif();
    assert.ok(original.includes(Buffer.from("hemmelig-ophavsret")));

    const r = await c.postForm(`/api/cases/${caseId}/images`, imageForm(original));
    assert.equal(r.status, 201);
    assert.ok(r.body.id);
    assert.match(r.body.url, /^https?:\/\//);
    assert.equal(r.body.view, null);
    assert.equal(r.body.storagePath, undefined);

    assert.deepEqual(await storedFiles(caseId), [`${r.body.id}.jpg`]);
    const { data: row } = await admin.from("case_images").select("storage_path, patient_id, consent_id").eq("id", r.body.id).single();
    assert.equal(row?.storage_path, `${caseId}/${r.body.id}.jpg`);
    assert.equal(row?.patient_id, userId);
    assert.ok(row?.consent_id);
    assert.equal(r.body.url.includes(userId), false, "patient-id må ikke stå i URL'en");

    const file = Buffer.from(await (await fetch(r.body.url)).arrayBuffer());
    assert.ok(file.length > 0);
    assert.equal(file.includes(Buffer.from("hemmelig-ophavsret")), false, "EXIF skal være fjernet");
    const { default: sharp } = await import("sharp");
    assert.equal((await sharp(file).metadata()).exif, undefined);

    const got = await c.get(`/api/cases/${caseId}`);
    assert.equal(got.body.images.length, 1);
    assert.match(got.body.images[0].url, /token=/);
  });

  it("afviser filer, der ikke er billeder, og mangler fil", async () => {
    const { c, caseId } = await anonymous();
    await giveImageConsent(c);
    const form = new FormData();
    form.set("file", new Blob([new TextEncoder().encode("det her er tekst, ikke et billede")], { type: "image/jpeg" }), "x.jpg");
    const bad = await c.postForm(`/api/cases/${caseId}/images`, form);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "INVALID_IMAGE");
    const none = await c.postForm(`/api/cases/${caseId}/images`, new FormData());
    assert.equal(none.status, 400);
    assert.equal(none.body.error.code, "MISSING_FILE");
    assert.deepEqual(await storedFiles(caseId), []);
  });

  it("højst 5 billeder pr. sag; sletning af et billede fjerner række og fil", async () => {
    const p = await account();
    await giveImageConsent(p.c);
    const image = await jpegWithExif();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await p.c.postForm(`/api/cases/${p.caseId}/images`, imageForm(image));
      assert.equal(r.status, 201, `billede ${i + 1}`);
      ids.push(r.body.id);
    }
    const sixth = await p.c.postForm(`/api/cases/${p.caseId}/images`, imageForm(image));
    assert.equal(sixth.status, 400);
    assert.equal(sixth.body.error.code, "IMAGE_LIMIT");
    assert.equal((await storedFiles(p.caseId)).length, 5);

    const del = await p.c.del(`/api/cases/${p.caseId}/images/${ids[0]}`);
    assert.equal(del.status, 204);
    assert.equal((await storedFiles(p.caseId)).length, 4);
    assert.equal((await p.c.get(`/api/cases/${p.caseId}`)).body.images.length, 4);
    assert.equal((await p.c.del(`/api/cases/${p.caseId}/images/${ids[0]}`)).status, 404);
  });

  it("tilbagetrækning af samtykket sletter billederne", async () => {
    const { c, caseId } = await anonymous();
    const consentId = await giveImageConsent(c);
    await c.postForm(`/api/cases/${caseId}/images`, imageForm(await jpegWithExif()));
    const w = await c.post(`/api/consents/${consentId}/withdraw`);
    assert.equal(w.body.deletedImages, 1);
    assert.deepEqual(await storedFiles(caseId), []);
    assert.deepEqual((await c.get(`/api/cases/${caseId}`)).body.images, []);
  });
});

describe("andre patienters sager giver 404", () => {
  it("læsning, redigering, ydelser, billeder, luk og slet rammer ikke en anden patients sag", async () => {
    const owner = await anonymous();
    await giveImageConsent(owner.c);
    const img = await owner.c.postForm(`/api/cases/${owner.caseId}/images`, imageForm(await jpegWithExif()));
    assert.equal(img.status, 201);
    const other = await account();
    await giveImageConsent(other.c);
    const [s] = await serviceIds(other.c, 1);

    const base = `/api/cases/${owner.caseId}`;
    assert.equal((await other.c.get(base)).status, 404);
    assert.equal((await other.c.patch(base, { postalCode: "8000" })).status, 404);
    assert.equal((await other.c.put(`${base}/services`, { services: [{ serviceId: s, suggestedByAi: false }] })).status, 404);
    assert.equal((await other.c.postForm(`${base}/images`, imageForm(await jpegWithExif()))).status, 404);
    assert.equal((await other.c.del(`${base}/images/${img.body.id}`)).status, 404);
    assert.equal((await other.c.post(`${base}/close`)).status, 404);
    assert.equal((await other.c.del(base)).status, 404);
    // Eget billede-id på en andens sag, og omvendt.
    assert.equal((await other.c.del(`/api/cases/${other.caseId}/images/${img.body.id}`)).status, 404);

    const intact = await owner.c.get(base);
    assert.equal(intact.status, 200);
    assert.equal(intact.body.status, "draft");
    assert.equal(intact.body.postalCode, null);
    assert.equal(intact.body.images.length, 1);
    assert.equal((await storedFiles(owner.caseId)).length, 1);
    assert.equal((await other.c.get("/api/cases")).body.cases.some((x: { id: string }) => x.id === owner.caseId), false);
  });
});

describe("luk og slet", () => {
  it("luk sætter status closed, er idempotent og låser sagen", async () => {
    const p = await account();
    const closed = await p.c.post(`/api/cases/${p.caseId}/close`);
    assert.equal(closed.status, 200);
    assert.equal(closed.body.status, "closed");
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/close`)).body.status, "closed");

    const patch = await p.c.patch(`/api/cases/${p.caseId}`, { postalCode: "2100" });
    assert.equal(patch.status, 409);
    assert.equal(patch.body.error.code, "NOT_DRAFT");
    const [s] = await serviceIds(p.c, 1);
    assert.equal((await p.c.put(`/api/cases/${p.caseId}/services`, { services: [{ serviceId: s, suggestedByAi: false }] })).status, 409);
    await giveImageConsent(p.c);
    const up = await p.c.postForm(`/api/cases/${p.caseId}/images`, imageForm(await jpegWithExif()));
    assert.equal(up.status, 409);
    assert.equal((await p.c.del(`/api/cases/${p.caseId}`)).status, 409);
    const { data } = await admin.from("cases").select("status, closed_at").eq("id", p.caseId).single();
    assert.equal(data?.status, "closed");
    assert.ok(data?.closed_at);
  });

  it("anonym patient kan lukke sin kladde", async () => {
    const { c, caseId } = await anonymous();
    const r = await c.post(`/api/cases/${caseId}/close`);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "closed");
  });

  it("slet fjerner kladden, rækker og billedfiler", async () => {
    const p = await account();
    await giveImageConsent(p.c);
    const [s] = await serviceIds(p.c, 1);
    await p.c.put(`/api/cases/${p.caseId}/services`, { services: [{ serviceId: s, suggestedByAi: false }] });
    for (let i = 0; i < 2; i++) {
      assert.equal((await p.c.postForm(`/api/cases/${p.caseId}/images`, imageForm(await jpegWithExif()))).status, 201);
    }
    assert.equal((await storedFiles(p.caseId)).length, 2);

    const del = await p.c.del(`/api/cases/${p.caseId}`);
    assert.equal(del.status, 204);
    assert.deepEqual(await storedFiles(p.caseId), []);
    assert.equal((await p.c.get(`/api/cases/${p.caseId}`)).status, 404);
    for (const table of ["cases", "case_images", "case_services"] as const) {
      const col = table === "cases" ? "id" : "case_id";
      const { data } = await admin.from(table).select(col).eq(col, p.caseId);
      assert.deepEqual(data, [], table);
    }
    assert.equal((await p.c.del(`/api/cases/${p.caseId}`)).status, 404);
  });

  it("anonym patient kan slette sin egen kladde", async () => {
    const { c, caseId } = await anonymous();
    assert.equal((await c.del(`/api/cases/${caseId}`)).status, 204);
    assert.equal((await c.get(`/api/cases/${caseId}`)).status, 404);
  });
});
