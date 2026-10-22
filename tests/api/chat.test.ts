// API-tests for trin 3.3: AI-chat og opsummering på sager (architecture 7, 10.5, 10.6).
// Kører mod en rigtig app + lokal Supabase med den falske AI-klient (AI_FAKE_CLIENT=1, sat af run.sh). Intet kald til OpenAI.
// Markører i beskeden styrer den falske klient: se services/ai/fakeAiClient.ts.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_CONSENT_VERSION,
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

// Konto uden AI-samtykke (til samtykketest).
async function accountWithoutConsent(): Promise<Patient> {
  const c = await newClientWithTerms();
  const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Chat" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  const created = await c.post("/api/cases");
  assert.equal(created.status, 201);
  return { c, caseId: created.body.id, userId: s.body.userId };
}

const say = (p: Patient, message: string) => p.c.post(`/api/cases/${p.caseId}/chat`, { message });

describe("chat: anonym og samtykke", () => {
  it("anonym chat virker og foreslår en ydelse fra kataloget", async () => {
    const p = await anonymous();
    const r = await say(p, "Jeg vil gerne have hvidere tænder");
    assert.equal(r.status, 201);
    assert.equal(r.body.assistantMessage.role, "assistant");
    assert.equal(r.body.assistantMessage.blocked, false);
    assert.equal(r.body.assistantMessage.suggestedServices[0].slug, "blegning");
    assert.equal(r.body.readyForSummary, true);
    assert.equal(r.body.emergency, false);
    assert.equal(r.body.messagesLeft, 29);

    const state = await p.c.get(`/api/cases/${p.caseId}/chat`);
    assert.equal(state.status, 200);
    assert.equal(state.body.messages.length, 2);
    assert.equal(state.body.readyForSummary, true);
    assert.equal(state.body.status, "active");

    // Forslaget ligger på sagen, men er ikke bekræftet.
    const c = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(c.body.hasConversation, true);
    assert.equal(c.body.suggestedServices[0].slug, "blegning");
    assert.deepEqual(c.body.services, []);
  });

  it("kræver aktivt ai_processing-samtykke", async () => {
    const p = await accountWithoutConsent();
    const denied = await say(p, "Hej");
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "CONSENT_REQUIRED");
    const sum = await p.c.post(`/api/cases/${p.caseId}/summary`, {});
    assert.equal(sum.status, 403);

    const grant = await p.c.post("/api/consents", { type: "ai_processing", textVersion: AI_CONSENT_VERSION });
    assert.equal(grant.status, 201);
    assert.equal((await say(p, "Hej")).status, 201);
  });

  it("andre patienter får 404, og ugyldig besked 400", async () => {
    const a = await anonymous();
    const b = await anonymous();
    assert.equal((await b.c.post(`/api/cases/${a.caseId}/chat`, { message: "hej" })).status, 404);
    assert.equal((await b.c.get(`/api/cases/${a.caseId}/chat`)).status, 404);
    assert.equal((await say(a, "")).status, 400);
    assert.equal((await say(a, "x".repeat(1001))).status, 400);
    assert.equal((await a.c.post(`/api/cases/${a.caseId}/chat`, { message: "hej", extra: 1 })).status, 400);
  });

  it("uden session afvises", async () => {
    const c = await newClientWithTerms();
    const r = await c.post("/api/cases/00000000-0000-4000-8000-000000000000/chat", { message: "hej" });
    assert.equal(r.status, 401);
  });

  it("personoplysninger maskeres før de gemmes", async () => {
    const p = await anonymous();
    const r = await say(p, "Ring på 12 34 56 78 eller skriv til anna@example.dk om blegning");
    assert.equal(r.status, 201);
    const stored = r.body.userMessage.content as string;
    assert.ok(!stored.includes("12 34 56 78") && !stored.includes("anna@example.dk"));
    assert.ok(stored.includes("[fjernet]"));
  });
});

describe("chat: guard og fejl", () => {
  it("svar med pris blokeres og erstattes af fast tekst", async () => {
    const p = await anonymous();
    const r = await say(p, "TEST_PRICE hvad koster det?");
    assert.equal(r.status, 201);
    assert.equal(r.body.assistantMessage.blocked, true);
    assert.ok(!/2\.500|\bkr\b/.test(r.body.assistantMessage.content));
    assert.equal(r.body.outOfScopeNotice, true);
    assert.deepEqual(r.body.assistantMessage.outOfScopeTopics, ["price"]);
  });

  it("ukendt slug afvises", async () => {
    const p = await anonymous();
    const r = await say(p, "test_unknown_slug");
    assert.equal(r.body.assistantMessage.blocked, true);
    assert.deepEqual(r.body.assistantMessage.suggestedServices, []);
  });

  it("hurtigsvar: kun i svaret på turen, og altid [] i GET /chat", async () => {
    const p = await anonymous();
    const r = await say(p, "Jeg har ondt i en tand");
    assert.equal(r.status, 201);
    assert.equal(r.body.emergency, false);
    assert.ok(Array.isArray(r.body.assistantMessage.quickReplies));
    assert.ok(r.body.assistantMessage.quickReplies.length >= 2);
    assert.deepEqual(r.body.userMessage.quickReplies, []);
    const state = await p.c.get(`/api/cases/${p.caseId}/chat`);
    for (const m of state.body.messages) assert.deepEqual(m.quickReplies, []);
  });

  // Akut-henvisning i chatten er midlertidigt slået fra (emergencyReferralInChat i services/ai/rules.ts, brugerens
  // beslutning 2026-10-19). Akut-reglen med henvisning er dækket af tests/ai med indstillingen slået til.
  it("akutte symptomer viser ingen akut-henvisning i chatten, mens indstillingen er slået fra", async () => {
    const p = await anonymous();
    const r = await say(p, "Jeg har stærke smerter og feber, og min blegning gør ondt");
    assert.equal(r.status, 201);
    assert.equal(r.body.emergency, false);
    assert.equal(r.body.assistantMessage.emergency, false);
    assert.doesNotMatch(r.body.assistantMessage.content, /112|1813/);
  });

  it("foreløbig vurdering er formuleret foreløbigt", async () => {
    const p = await anonymous();
    const r = await say(p, "Er det karies?");
    const a = r.body.assistantMessage.preliminaryAssessment as string;
    assert.match(a, /kan pege på/);
    assert.match(a, /Klinikken laver den endelige vurdering/);
  });

  it("usikker patient får et spørgsmål først og foreslår undersoegelse bagefter", async () => {
    const p = await anonymous();
    const first = await say(p, "Jeg ved ikke rigtig, hvad jeg vil");
    assert.deepEqual(first.body.assistantMessage.suggestedServices, []);
    assert.ok((first.body.assistantMessage.content as string).trim().endsWith("?"));
    const second = await say(p, "Jeg vil bare have et tjek");
    assert.equal(second.body.assistantMessage.suggestedServices[0].slug, "undersoegelse");
  });

  it("timeout fra modellen giver 503, og ugyldigt format blokeres", async () => {
    const p = await anonymous();
    const t = await say(p, "test_timeout");
    assert.equal(t.status, 503);
    assert.equal(t.body.error.code, "AI_UNAVAILABLE");
    const i = await say(p, "test_invalid");
    assert.equal(i.status, 201);
    assert.equal(i.body.assistantMessage.blocked, true);
  });

  it("loftet på 30 beskeder lukker samtalen (429 CHAT_LIMIT)", async () => {
    const p = await anonymous();
    for (let i = 0; i < 30; i++) {
      const r = await say(p, `besked ${i}`);
      assert.equal(r.status, 201, `besked ${i}`);
    }
    const over = await say(p, "en til");
    assert.equal(over.status, 429);
    assert.equal(over.body.error.code, "CHAT_LIMIT");
    const state = await p.c.get(`/api/cases/${p.caseId}/chat`);
    assert.equal(state.body.status, "closed");
    assert.equal(state.body.messagesLeft, 0);
  });

  it("det fælles døgnloft for anonyme afviser med 429 ANON_CAP_REACHED og kan nulstilles", async () => {
    const before = await admin.from("ai_limits").select("value").eq("key", "anon_daily_ai_calls").single();
    const original = before.data?.value as number;
    try {
      await admin.from("ai_limits").update({ value: 1 }).eq("key", "anon_daily_ai_calls");
      const p = await anonymous();
      let capped = false;
      for (let i = 0; i < 3 && !capped; i++) {
        const r = await say(p, "hej");
        if (r.status === 429) {
          assert.equal(r.body.error.code, "ANON_CAP_REACHED");
          capped = true;
        }
      }
      assert.ok(capped);
    } finally {
      await admin.from("ai_limits").update({ value: original }).eq("key", "anon_daily_ai_calls");
    }
    const p2 = await anonymous();
    assert.equal((await say(p2, "hej")).status, 201);
  });

  it("en sendt eller lukket sag kan ikke chattes på (409)", async () => {
    const p = await anonymous();
    assert.equal((await p.c.post(`/api/cases/${p.caseId}/close`)).status, 200);
    const r = await say(p, "hej");
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "NOT_DRAFT");
  });
});

describe("opsummering", () => {
  it("kræver en samtale (409 NO_CONVERSATION)", async () => {
    const p = await anonymous();
    const r = await p.c.post(`/api/cases/${p.caseId}/summary`, {});
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "NO_CONVERSATION");
  });

  it("udkast gemmes, indeholder ingen vurdering, og godkendes via PUT", async () => {
    const p = await anonymous();
    await say(p, "Jeg vil gerne have hvidere tænder, og er det karies?");
    const svc = await p.c.get("/api/services");
    const blegning = svc.body.groups.flatMap((g: { services: { id: string; slug: string }[] }) => g.services).find((s: { slug: string }) => s.slug === "blegning");
    assert.equal((await p.c.put(`/api/cases/${p.caseId}/services`, { services: [{ serviceId: blegning.id, suggestedByAi: true }] })).status, 200);

    const r = await p.c.post(`/api/cases/${p.caseId}/summary`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.fallback, "none");
    assert.equal(r.body.generationsLeft, 2);
    assert.deepEqual(r.body.retakeImages, []);
    assert.deepEqual(r.body.summary.suggestedServices, ["blegning"]);
    assert.ok(!("preliminaryAssessment" in r.body.summary));
    assert.ok(!/kan pege på/.test(r.body.summary.summaryText));

    const c = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(c.body.aiSummary.summaryText, r.body.summary.summaryText);
    assert.equal(c.body.summaryApprovedAt, null);

    const ok = await p.c.put(`/api/cases/${p.caseId}/summary`, { summaryText: "Jeg vil gerne have lysere tænder." });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.summaryApprovedAt);
    const after = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(after.body.summaryText, "Jeg vil gerne have lysere tænder.");
    assert.ok(after.body.summaryApprovedAt);

    // En ny chatbesked nulstiller godkendelsen.
    await say(p, "Jeg vil også i gang snart");
    const reset = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(reset.body.summaryApprovedAt, null);
  });

  it("validering og ejerskab af godkendelsen", async () => {
    const a = await anonymous();
    const b = await anonymous();
    assert.equal((await a.c.put(`/api/cases/${a.caseId}/summary`, { summaryText: "" })).status, 400);
    assert.equal((await a.c.put(`/api/cases/${a.caseId}/summary`, { summaryText: "x".repeat(1501) })).status, 400);
    assert.equal((await b.c.put(`/api/cases/${a.caseId}/summary`, { summaryText: "hej" })).status, 404);
    assert.equal((await b.c.post(`/api/cases/${a.caseId}/summary`, {})).status, 404);
  });

  it("anonym har 3 genereringer pr. sag (429 SUMMARY_LIMIT)", async () => {
    const p = await anonymous();
    await say(p, "Jeg vil have blegning");
    for (let i = 0; i < 3; i++) assert.equal((await p.c.post(`/api/cases/${p.caseId}/summary`, {})).status, 200);
    const over = await p.c.post(`/api/cases/${p.caseId}/summary`, {});
    assert.equal(over.status, 429);
    assert.equal(over.body.error.code, "SUMMARY_LIMIT");
  });

  it("billeder med dårlig kvalitet melder retakeImages, og kvaliteten gemmes på billedet", async () => {
    const p = await anonymous();
    const consent = await p.c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION });
    assert.equal(consent.status, 201);
    const up = await p.c.postForm(`/api/cases/${p.caseId}/images`, imageForm(await jpegWithExif()));
    assert.equal(up.status, 201);
    await say(p, "Mine tænder er gule test_dark");
    const r = await p.c.post(`/api/cases/${p.caseId}/summary`, {});
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.retakeImages, [{ imageId: up.body.id, reason: "too_dark" }]);
    assert.equal(r.body.summary.images[0].imageRef, up.body.id);
    const c = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(c.body.images[0].quality, "too_dark");
  });

  it("billeder uden billedsamtykke sendes ikke (ingen billeder i opsummeringen)", async () => {
    const p = await anonymous();
    await say(p, "Jeg vil have blegning");
    const r = await p.c.post(`/api/cases/${p.caseId}/summary`, {});
    assert.deepEqual(r.body.summary.images, []);
  });
});

describe("dataeksport", () => {
  it("indeholder egne AI-samtaler pr. sag", async () => {
    const p = await anonymous();
    await say(p, "Jeg vil have blegning");
    const exp = await p.c.get("/api/patients/me/export");
    assert.equal(exp.status, 200);
    assert.equal(exp.body.chat.length, 1);
    assert.equal(exp.body.chat[0].caseId, p.caseId);
    assert.equal(exp.body.chat[0].messages.length, 2);
    assert.equal(exp.body.chat[0].messages[0].role, "user");

    const other = await anonymous();
    const otherExp = await other.c.get("/api/patients/me/export");
    assert.deepEqual(otherExp.body.chat, []);
  });
});
