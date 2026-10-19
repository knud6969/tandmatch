// API-tests for 3.6b: atomisk reservation af chat-turen og lofterne (H1), IP-grænser, billedbeskrivelser (B2),
// hærdning (M2, L2, L4, L5, L6, B7, summary_ai_assisted). Kører mod en rigtig app + lokal Supabase med den falske
// AI-klient (AI_FAKE_CLIENT=1, sat af run.sh). Intet kald til OpenAI.
//
// Om at tælle modelkald: den falske klient oprettes pr. request i serverprocessen, så testen kan ikke læse en tæller.
// Hver reserveret tur giver i stedet præcis ét modelkald og ét svar fra den falske klient (en fast, genkendelig tekst),
// mens en afvist tur hverken indsætter en besked eller når modellen. Antal svar med modellens tekst = antal modelkald.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AI_CONSENT_VERSION,
  BASE_URL,
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

// Permanent konto med AI-samtykke og en tom sag.
async function account(): Promise<Patient> {
  const c = await newClientWithTerms();
  const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Hærdning" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  assert.equal((await c.post("/api/consents", { type: "ai_processing", textVersion: AI_CONSENT_VERSION })).status, 201);
  const created = await c.post("/api/cases");
  assert.equal(created.status, 201);
  return { c, caseId: created.body.id, userId: s.body.userId };
}

const say = (p: Patient, message: string) => p.c.post(`/api/cases/${p.caseId}/chat`, { message });
const MODEL_REPLY = "Så kan blegning være relevant. Du kan selv bekræfte behandlingen nedenfor, og klinikken laver den endelige vurdering."; // den falske klients svar på "blegning"

async function messagesOf(caseId: string) {
  const conv = await admin.from("ai_conversations").select("id").eq("case_id", caseId).single();
  const rows = await admin.from("ai_messages").select("role, content, blocked").eq("conversation_id", conv.data!.id);
  return rows.data ?? [];
}

// Sætter lofter midlertidigt og nulstiller de anonyme tællere for dagen.
async function withLimits(limits: Record<string, number>, fn: () => Promise<void>) {
  const keys = Object.keys(limits);
  const before = await admin.from("ai_limits").select("key, value").in("key", keys);
  try {
    for (const [key, value] of Object.entries(limits)) await admin.from("ai_limits").update({ value }).eq("key", key);
    await admin.from("ai_usage_daily").delete().gte("day", "1900-01-01");
    await admin.from("ai_anon_user_usage_daily").delete().gte("day", "1900-01-01");
    await fn();
  } finally {
    for (const row of before.data ?? []) await admin.from("ai_limits").update({ value: row.value }).eq("key", row.key);
    await admin.from("ai_usage_daily").delete().gte("day", "1900-01-01");
  }
}

describe("H1: samtidige chat-ture reserveres atomisk", () => {
  it("20 samtidige ture fra én anonym bruger: kun brugerens eget døgnloft når modellen", async () => {
    await withLimits({ anon_user_daily_ai_calls: 5, anon_daily_ai_calls: 1000 }, async () => {
      const p = await anonymous();
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => say(p, `blegning ${i}`)));
      const ok = results.filter((r) => r.status === 201);
      const refused = results.filter((r) => r.status === 429);
      assert.equal(ok.length, 5, "præcis 5 ture tilladt");
      assert.equal(refused.length, 15);
      assert.ok(refused.every((r) => r.body.error.code === "RATE_LIMITED"));
      const messages = await messagesOf(p.caseId);
      assert.equal(messages.filter((m) => m.role === "user").length, 5, "kun reserverede ture er gemt");
      assert.equal(messages.filter((m) => m.role === "assistant" && m.content === MODEL_REPLY).length, 5, "præcis 5 modelkald");
      assert.equal(messages.filter((m) => m.role === "assistant").length, 5);
    });
  });

  it("20 samtidige ture med 25 beskeder brugt: kun de sidste 5 af de 30 når modellen", async () => {
    const p = await account();
    for (let i = 0; i < 25; i++) assert.equal((await say(p, `blegning ${i}`)).status, 201, `besked ${i}`);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => say(p, `blegning samtidig ${i}`)));
    assert.equal(results.filter((r) => r.status === 201).length, 5);
    const refused = results.filter((r) => r.status === 429);
    assert.equal(refused.length, 15);
    assert.ok(refused.every((r) => r.body.error.code === "CHAT_LIMIT"));
    const messages = await messagesOf(p.caseId);
    assert.equal(messages.filter((m) => m.role === "user").length, 30);
    assert.equal(messages.filter((m) => m.role === "assistant" && m.content === MODEL_REPLY).length, 30, "30 modelkald i alt");
    const state = await p.c.get(`/api/cases/${p.caseId}/chat`);
    assert.equal(state.body.status, "closed");
    assert.equal(state.body.messages.length, 60, "hver tur har et svar, også den sidste");
  });

  it("én anonym bruger kan ikke tømme det globale anonyme loft", async () => {
    await withLimits({ anon_user_daily_ai_calls: 5, anon_daily_ai_calls: 8 }, async () => {
      const a = await anonymous();
      const b = await anonymous();
      const c = await anonymous();
      const burstA = await Promise.all(Array.from({ length: 20 }, (_, i) => say(a, `blegning a${i}`)));
      assert.equal(burstA.filter((r) => r.status === 201).length, 5, "A stoppes af sit eget loft");
      const burstB = await Promise.all(Array.from({ length: 20 }, (_, i) => say(b, `blegning b${i}`)));
      assert.equal(burstB.filter((r) => r.status === 201).length, 3, "B får resten af det globale loft (8 - 5)");
      assert.ok(burstB.filter((r) => r.status === 429).every((r) => ["ANON_CAP_REACHED", "RATE_LIMITED"].includes(r.body.error.code)));
      const cReply = await say(c, "blegning c");
      assert.equal(cReply.status, 429);
      assert.equal(cReply.body.error.code, "ANON_CAP_REACHED");
      const usage = await admin.from("ai_usage_daily").select("anonymous_calls");
      assert.equal(usage.data?.[0]?.anonymous_calls, 8, "det globale loft stopper præcis ved 8");
      assert.equal((await messagesOf(c.caseId)).length, 0, "den afviste tur gemmer intet");
    });
  });

  it("modelfejl efter reservationen gemmer en fast tekst som svar, så turen ikke står ubesvaret", async () => {
    const p = await anonymous();
    const failed = await say(p, "test_timeout");
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error.code, "AI_UNAVAILABLE");
    const state = await p.c.get(`/api/cases/${p.caseId}/chat`);
    assert.equal(state.body.messages.length, 2);
    assert.equal(state.body.messages[0].role, "user");
    assert.equal(state.body.messages[1].role, "assistant");
    assert.match(state.body.messages[1].content, /^Jeg kunne ikke svare lige nu/);
    assert.equal(state.body.messagesLeft, 29, "turen er brugt");
    assert.equal((await say(p, "blegning")).status, 201, "samtalen kan fortsætte");
  });
});

describe("3.7b: døgnloft og fejl efter reservationen", () => {
  it("M1: døgnloftet pr. patient overlever, at sagen slettes og oprettes igen", async () => {
    await withLimits({ chat_messages_per_patient_day: 2 }, async () => {
      const p = await account();
      assert.equal((await say(p, "blegning 1")).status, 201);
      assert.equal((await say(p, "blegning 2")).status, 201);
      assert.equal((await say(p, "blegning 3")).status, 429);
      assert.equal((await p.c.del(`/api/cases/${p.caseId}`)).status, 204);
      const created = await p.c.post("/api/cases");
      assert.equal(created.status, 201);
      const again = await p.c.post(`/api/cases/${created.body.id}/chat`, { message: "blegning 4" });
      assert.equal(again.status, 429);
      assert.equal(again.body.error.code, "RATE_LIMITED");
    });
  });

  it("fejl efter reservationen giver AI_UNAVAILABLE, og turen ligger i samtalen (frontend henter den igen)", async () => {
    const p = await account();
    const failed = await say(p, "test_timeout");
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error.code, "AI_UNAVAILABLE");
    const state = await p.c.get(`/api/cases/${p.caseId}/chat`);
    assert.equal(state.body.messages[0].role, "user");
    assert.equal(state.body.messages[0].content, "test_timeout");
  });

  it("M2: reserve_chat_turn kan ikke kaldes direkte med en bruger-JWT", async () => {
    const p = await account();
    await say(p, "blegning");
    const conv = await admin.from("ai_conversations").select("id").eq("case_id", p.caseId).single();
    const { createClient } = await import("@supabase/supabase-js");
    const user = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const res = await user.rpc("reserve_chat_turn", { p_user_id: p.userId, p_conversation_id: conv.data!.id, p_content: "direkte" });
    assert.ok(res.error, "anon-nøglen kan ikke kalde funktionen");
    const res2 = await user.rpc("consume_summary_generation", { p_user_id: p.userId, p_case_id: p.caseId });
    assert.ok(res2.error);
  });
});

describe("H1: IP-grænse på chat og opsummering", () => {
  it("chat: grænsen på 120 pr. time pr. IP giver 429 RATE_LIMITED", async () => {
    const p = await anonymous();
    const statuses: number[] = [];
    // Tom besked giver 400 efter grænsen er talt (rate limit kommer før parsing af input).
    for (let batch = 0; batch < 5; batch++) {
      const results = await Promise.all(Array.from({ length: 26 }, () => say(p, "")));
      statuses.push(...results.map((r) => r.status));
    }
    assert.equal(statuses.filter((s) => s === 400).length, 120);
    const limited = statuses.filter((s) => s === 429);
    assert.equal(limited.length, 10);
    const again = await say(p, "");
    assert.equal(again.status, 429);
    assert.equal(again.body.error.code, "RATE_LIMITED");
  });

  it("opsummering: grænsen på 20 pr. time pr. IP giver 429 RATE_LIMITED", async () => {
    const p = await anonymous();
    const results = [];
    for (let i = 0; i < 22; i++) results.push(await p.c.post(`/api/cases/${p.caseId}/summary`, {}));
    assert.equal(results.filter((r) => r.status === 409).length, 20);
    assert.deepEqual(results.slice(20).map((r) => r.status), [429, 429]);
    assert.equal(results[21].body.error.code, "RATE_LIMITED");
  });
});

describe("opsummering og billeder (B2, B7, summary_ai_assisted, L2, L4, L6)", () => {
  async function withImageAndSummary() {
    const p = await anonymous();
    assert.equal((await p.c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION })).status, 201);
    const up = await p.c.postForm(`/api/cases/${p.caseId}/images`, imageForm(await jpegWithExif()));
    assert.equal(up.status, 201);
    await say(p, "Jeg vil have blegning af mine gule tænder");
    const gen = await p.c.post(`/api/cases/${p.caseId}/summary`, {});
    assert.equal(gen.status, 200);
    return { p, imageId: up.body.id as string, draft: gen.body.summary.summaryText as string };
  }

  it("B2: beskrivelsen får et tidsstempel ved generering, og godkendelsen kommer bagefter", async () => {
    const { p, imageId } = await withImageAndSummary();
    const image = await admin.from("case_images").select("ai_description, ai_described_at").eq("id", imageId).single();
    assert.ok(image.data?.ai_description);
    assert.ok(image.data?.ai_described_at, "databasen stempler beskrivelsen");
    const dto = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(dto.body.images[0].description, image.data?.ai_description, "patienten ser beskrivelsen i CaseDto");
    const approve = await p.c.put(`/api/cases/${p.caseId}/summary`, { summaryText: "Jeg vil have lysere tænder." });
    assert.equal(approve.status, 200);
    const row = await admin.from("cases").select("summary_approved_at").eq("id", p.caseId).single();
    assert.ok(new Date(row.data!.summary_approved_at!) >= new Date(image.data!.ai_described_at!), "godkendt efter beskrivelsen");
    // En ny generering skriver beskrivelsen igen og får et nyere tidsstempel end godkendelsen.
    const regen = await p.c.post(`/api/cases/${p.caseId}/summary`, {});
    assert.equal(regen.status, 200);
    const after = await admin.from("case_images").select("ai_described_at").eq("id", imageId).single();
    assert.ok(new Date(after.data!.ai_described_at!) > new Date(row.data!.summary_approved_at!), "ny beskrivelse er nyere end den gamle godkendelse");
  });

  it("summary_ai_assisted: true, når AI-teksten bruges eller rettes let, false når den erstattes helt", async () => {
    const { p, draft } = await withImageAndSummary();
    const flag = async () => (await admin.from("cases").select("summary_ai_assisted").eq("id", p.caseId).single()).data!.summary_ai_assisted;
    assert.equal(await flag(), true, "true efter generering");
    assert.equal((await p.c.put(`/api/cases/${p.caseId}/summary`, { summaryText: "Ønsker en helt anden behandling snarest muligt." })).status, 200);
    assert.equal(await flag(), false, "erstattet helt giver false");
    assert.equal((await p.c.put(`/api/cases/${p.caseId}/summary`, { summaryText: `${draft} Tak.` })).status, 200);
    assert.equal(await flag(), true, "AI-teksten med en rettelse giver true");
  });

  it("summary_ai_assisted er false, når der aldrig er lavet et AI-udkast", async () => {
    const p = await anonymous();
    assert.equal((await p.c.put(`/api/cases/${p.caseId}/summary`, { summaryText: "Skrevet helt selv." })).status, 200);
    const row = await admin.from("cases").select("summary_ai_assisted").eq("id", p.caseId).single();
    assert.equal(row.data!.summary_ai_assisted, false);
  });

  it("B7: ugyldigt indhold i ai_summary giver null i stedet for en fejl", async () => {
    const p = await anonymous();
    const stored = await admin.rpc("store_ai_summary", {
      p_user_id: p.userId,
      p_case_id: p.caseId,
      p_summary: { forkert: "form" },
      p_ai_assisted: true,
      p_model: "m",
      p_prompt_version: "v",
    });
    assert.equal(stored.error, null);
    const c = await p.c.get(`/api/cases/${p.caseId}`);
    assert.equal(c.status, 200);
    assert.equal(c.body.aiSummary, null);
  });

  it("L2: et ældre ai_processing-samtykke giver 403 på chat og opsummering", async () => {
    const version = `ai_processing@old-${Date.now()}`;
    await admin.from("consent_text_versions").insert({ type: "ai_processing", text_version: version, ai_disclosure: false });
    const c = await newClientWithTerms();
    const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Gammel" });
    assert.equal(s.status, 201);
    try {
      await admin.from("consents").insert({ patient_id: s.body.userId, type: "ai_processing", text_version: version });
      const created = await c.post("/api/cases");
      const chat = await c.post(`/api/cases/${created.body.id}/chat`, { message: "hej" });
      assert.equal(chat.status, 403);
      assert.equal(chat.body.error.code, "CONSENT_REQUIRED");
      const sum = await c.post(`/api/cases/${created.body.id}/summary`, {});
      assert.equal(sum.status, 403);
      assert.equal(sum.body.error.code, "CONSENT_REQUIRED");
    } finally {
      await admin.auth.admin.deleteUser(s.body.userId);
      await admin.from("consent_text_versions").delete().eq("text_version", version);
    }
  });

  it("L4: sletning af en kladde fjerner rækken og billedfilerne", async () => {
    const { p, imageId } = await withImageAndSummary();
    const path = `${p.caseId}/${imageId}.jpg`;
    const before = await admin.storage.from("case-images").list(p.caseId);
    assert.equal(before.data?.length, 1);
    const del = await p.c.del(`/api/cases/${p.caseId}`);
    assert.equal(del.status, 204);
    assert.equal((await admin.from("cases").select("id").eq("id", p.caseId)).data?.length, 0);
    assert.equal((await admin.storage.from("case-images").list(p.caseId)).data?.length, 0, path);
    assert.equal((await p.c.get(`/api/cases/${p.caseId}`)).status, 404);
  });

  it("L6: dataeksporten beskriver billederne (metadata, aldrig sti eller URL)", async () => {
    const { p, imageId } = await withImageAndSummary();
    const exp = await p.c.get("/api/patients/me/export");
    assert.equal(exp.status, 200);
    const images = exp.body.cases[0].images;
    assert.equal(images.length, 1);
    assert.equal(images[0].id, imageId);
    assert.equal(images[0].view, "front");
    assert.equal(images[0].quality, "ok");
    assert.ok(images[0].description);
    assert.ok(images[0].createdAt);
    assert.ok(!JSON.stringify(images[0]).includes(".jpg") && !JSON.stringify(images[0]).includes("http"));
  });
});

describe("M2 og L5", () => {
  it("M2: et billedupload uden content-length afvises med 411", async () => {
    const p = await anonymous();
    assert.equal((await p.c.post("/api/consents", { type: "image_upload", textVersion: IMAGE_CONSENT_VERSION })).status, 201);
    const bytes = new TextEncoder().encode("--x\r\ncontent-disposition: form-data; name=\"file\"; filename=\"a.jpg\"\r\n\r\nxxxx\r\n--x--\r\n");
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const res = await fetch(`${BASE_URL}/api/cases/${p.caseId}/images`, {
      method: "POST",
      headers: {
        "x-forwarded-for": p.c.ip,
        "content-type": "multipart/form-data; boundary=x",
        cookie: [...p.c.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body,
      duplex: "half",
    } as RequestInit);
    assert.equal(res.status, 411);
    assert.equal((await res.json()).error.code, "LENGTH_REQUIRED");
    // Et almindeligt upload (med content-length) virker stadig.
    assert.equal((await p.c.postForm(`/api/cases/${p.caseId}/images`, imageForm(await jpegWithExif()))).status, 201);
  });

  it("L5: en anonym session med aktivitet ældre end 48 timer afvises", async () => {
    const p = await anonymous();
    assert.equal((await p.c.get("/api/me")).status, 200);
    const old = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
    const upd = await admin.from("profiles").update({ last_active_at: old }).eq("id", p.userId);
    assert.equal(upd.error, null);
    const me = await p.c.get("/api/me");
    assert.equal(me.status, 401);
    assert.equal((await say(p, "blegning")).status, 401);
    const row = await admin.from("profiles").select("last_active_at").eq("id", p.userId).single();
    assert.equal(new Date(row.data!.last_active_at).toISOString(), old, "afvisningen forlænger ikke sessionen");
  });

  it("L5: en anonym session lige under 48 timer virker stadig", async () => {
    const p = await anonymous();
    const recent = new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString();
    await admin.from("profiles").update({ last_active_at: recent }).eq("id", p.userId);
    assert.equal((await p.c.get("/api/me")).status, 200);
  });
});
