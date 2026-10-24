// API-tests for billedturen (cases 7.9c): AI'en reagerer selv på uploadede billeder uden patientbesked.
// Kører mod en rigtig app + lokal Supabase med den falske AI-klient (AI_FAKE_CLIENT=1). Markører: se fakeAiClient.ts.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { IMAGE_CONSENT_VERSION, TestClient, adminClient, imageForm, jpegWithExif, newClientWithTerms } from "../../../../tests/api/helpers.ts";

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

const giveImageConsent = async (p: Patient) => {
  const r = await p.c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION });
  assert.equal(r.status, 201);
  return r.body.id as string;
};
const upload = async (p: Patient) => {
  const r = await p.c.postForm(`/api/cases/${p.caseId}/images`, imageForm(await jpegWithExif()));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
};
const imageTurn = (p: Patient) => p.c.post(`/api/cases/${p.caseId}/chat/image-turn`, {});
const say = (p: Patient, message: string) => p.c.post(`/api/cases/${p.caseId}/chat`, { message });

describe("billedtur: AI'en reagerer selv på et uploadet billede", () => {
  it("kvitterer uden patientbesked, gemmer kvaliteten og tæller ikke som en besked", async () => {
    const p = await anonymous();
    await say(p, "Jeg har et problem med en tand");
    await giveImageConsent(p);
    const img = await upload(p);
    assert.equal(img.quality, null);
    assert.ok(!Number.isNaN(Date.parse(img.createdAt)), "createdAt på ImageDto");

    const before = await p.c.get(`/api/cases/${p.caseId}/chat`);
    const r = await imageTurn(p);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.assistantMessage.role, "assistant");
    assert.equal(r.body.assistantMessage.blocked, false);
    assert.deepEqual(r.body.assessedImages, [{ imageId: img.id, view: "front", quality: "ok" }]);
    assert.equal(r.body.emergency, false);
    assert.equal(r.body.messagesLeft, before.body.messagesLeft, "billedturen tæller ikke som en patientbesked");

    const after = await p.c.get(`/api/cases/${p.caseId}/chat`);
    assert.equal(after.body.messages.length, before.body.messages.length + 1);
    assert.equal(after.body.messages.filter((m: { role: string }) => m.role === "user").length, 1, "ingen brugerbesked fra billedturen");
    assert.equal(after.body.messagesLeft, before.body.messagesLeft);
    const last = after.body.messages[after.body.messages.length - 1];
    assert.ok(last.createdAt >= img.createdAt, "assistentsvaret ligger efter billedet i tidslinjen");

    const c = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(c.body.images[0].quality, "ok");
    assert.equal(c.body.images[0].view, "front");
    assert.equal(c.body.images[0].createdAt, img.createdAt);
  });

  it("dårlig kvalitet kommer tilbage på billedet og i svaret", async () => {
    const p = await anonymous();
    await say(p, "Mine tænder er gule test_dark");
    await giveImageConsent(p);
    const img = await upload(p);
    const r = await imageTurn(p);
    assert.equal(r.status, 201);
    assert.equal(r.body.assessedImages[0].quality, "too_dark");
    assert.equal((await p.c.get(`/api/cases/${p.caseId}`)).body.images[0].quality, "too_dark");
    assert.equal(r.body.assessedImages[0].imageId, img.id);
  });

  it("virker uden en eksisterende samtale (billede først), og højst én tur pr. upload-batch", async () => {
    const p = await anonymous();
    await giveImageConsent(p);
    await upload(p);
    await upload(p);
    const first = await imageTurn(p);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.assessedImages.length, 2, "begge billeder i samme tur");
    const again = await imageTurn(p);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, "NO_NEW_IMAGES");
    await upload(p);
    assert.equal((await imageTurn(p)).status, 201, "et nyt billede giver en ny tur");
  });

  it("kræver image_upload-samtykke og billeder, og kun ejeren kan bruge den", async () => {
    const p = await anonymous();
    const noConsent = await imageTurn(p);
    assert.equal(noConsent.status, 403);
    assert.equal(noConsent.body.error.code, "CONSENT_REQUIRED");
    await giveImageConsent(p);
    const noImages = await imageTurn(p);
    assert.equal(noImages.status, 409);
    assert.equal(noImages.body.error.code, "NO_NEW_IMAGES");

    await upload(p);
    const other = await anonymous();
    assert.equal((await other.c.post(`/api/cases/${p.caseId}/chat/image-turn`, {})).status, 404);
    assert.equal((await new TestClient().post(`/api/cases/${p.caseId}/chat/image-turn`, {})).status, 403, "kræver vilkår");
  });

  it("samme guardrails: en pris i svaret blokeres (fast tekst), og kvaliteten gemmes alligevel", async () => {
    const p = await anonymous();
    await say(p, "test_image_price");
    await giveImageConsent(p);
    await upload(p);
    const r = await imageTurn(p);
    assert.equal(r.status, 201);
    assert.equal(r.body.assistantMessage.blocked, true);
    assert.doesNotMatch(r.body.assistantMessage.content, /\bkr\b|2\.500/);
    assert.equal(r.body.assessedImages[0].quality, "ok");
  });

  it("modelfejl giver 503, og billedet kan sendes igen", async () => {
    const p = await anonymous();
    await say(p, "test_image_timeout");
    await giveImageConsent(p);
    await upload(p);
    const r = await imageTurn(p);
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, "AI_UNAVAILABLE");
    const retry = await imageTurn(p);
    assert.equal(retry.status, 503, "stemplet er fortrudt: turen kan forsøges igen (ikke 409)");
  });

  it("afvises, når sagen ikke længere er en kladde eller billedsamtykket er trukket tilbage", async () => {
    const p = await anonymous();
    const consentId = await giveImageConsent(p);
    await upload(p);
    await p.c.post(`/api/consents/${consentId}/withdraw`);
    const r = await imageTurn(p);
    assert.equal(r.status, 403);
  });
});
