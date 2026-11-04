// API-tests for push-tokens (identity 10.15, platform 14): registrering, flytning mellem konti, roller, validering og eksport.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD, TestClient, adminClient, newClientWithTerms, randomCvr, uniqueEmail } from "../../../../tests/api/helpers.ts";

assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^http:\/\/(127\.0\.0\.1|localhost):/, "kun lokal Supabase");

const admin = adminClient();
const createdUserIds = new Set<string>();
after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

async function patient(): Promise<{ c: TestClient; userId: string }> {
  const c = await newClientWithTerms();
  const r = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Lea" });
  assert.equal(r.status, 201);
  createdUserIds.add(r.body.userId);
  return { c, userId: r.body.userId };
}

const token = () => `ExponentPushToken[${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}]`;
const rows = async (t: string) => (await admin.from("push_tokens").select("user_id, platform").eq("token", t)).data ?? [];

describe("PUT/DELETE /api/push-tokens", () => {
  it("patient med konto registrerer et token (204), og rækken findes", async () => {
    const p = await patient();
    const t = token();
    const r = await p.c.put("/api/push-tokens", { token: t, platform: "ios" });
    assert.equal(r.status, 204);
    assert.deepEqual(await rows(t), [{ user_id: p.userId, platform: "ios" }]);
    assert.equal((await p.c.put("/api/push-tokens", { token: t, platform: "ios" })).status, 204, "samme token igen");
    assert.equal((await rows(t)).length, 1);
  });

  it("samme token fra en anden patient flytter det", async () => {
    const a = await patient();
    const b = await patient();
    const t = token();
    assert.equal((await a.c.put("/api/push-tokens", { token: t, platform: "ios" })).status, 204);
    assert.equal((await b.c.put("/api/push-tokens", { token: t, platform: "ios" })).status, 204);
    assert.deepEqual(await rows(t), [{ user_id: b.userId, platform: "ios" }]);
  });

  it("anonym 403 ACCOUNT_REQUIRED, klinik 403 FORBIDDEN, uden session 401", async () => {
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    const r = await anon.put("/api/push-tokens", { token: token(), platform: "ios" });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "ACCOUNT_REQUIRED");

    const k = await newClientWithTerms();
    const s = await k.post("/api/auth/signup", { role: "clinic", email: uniqueEmail("klinik"), password: PASSWORD, cvr: randomCvr(), clinicName: "Pushtest ApS", address: "Testvej 1", postalCode: "2100", city: "København Ø", phone: "00 00 00 01" });
    assert.equal(s.status, 201);
    createdUserIds.add(s.body.userId);
    const f = await k.put("/api/push-tokens", { token: token(), platform: "ios" });
    assert.equal(f.status, 403);
    assert.equal(f.body.error.code, "FORBIDDEN");

    assert.equal((await (await newClientWithTerms()).put("/api/push-tokens", { token: token(), platform: "ios" })).status, 401);
  });

  it("ugyldigt token, platform eller ukendt felt giver 400", async () => {
    const p = await patient();
    for (const body of [
      { token: "foo", platform: "ios" },
      { token: "ExponentPushToken[ab]", platform: "ios" },
      { token: token(), platform: "web" },
      { token: token(), platform: "ios", extra: 1 },
      { platform: "ios" },
    ]) {
      const r = await p.c.put("/api/push-tokens", body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error.code, "VALIDATION_ERROR");
    }
  });

  it("DELETE sletter eget token; et fremmed eller ukendt token giver 204 og sletter intet", async () => {
    const a = await patient();
    const b = await patient();
    const ta = token();
    assert.equal((await a.c.put("/api/push-tokens", { token: ta, platform: "ios" })).status, 204);
    assert.equal((await b.c.del("/api/push-tokens", { token: ta })).status, 204);
    assert.equal((await rows(ta)).length, 1, "B kan ikke slette A's token");
    assert.equal((await b.c.del("/api/push-tokens", { token: token() })).status, 204);
    assert.equal((await a.c.del("/api/push-tokens", { token: ta })).status, 204);
    assert.equal((await rows(ta)).length, 0);
    assert.equal((await a.c.del("/api/push-tokens", {})).status, 400);
  });

  it("dataeksporten har pushDevices uden selve tokenet", async () => {
    const p = await patient();
    const t = token();
    await p.c.put("/api/push-tokens", { token: t, platform: "ios" });
    const exp = await p.c.get("/api/patients/me/export");
    assert.equal(exp.status, 200);
    assert.equal(exp.body.pushDevices.length, 1);
    assert.deepEqual(Object.keys(exp.body.pushDevices[0]).sort(), ["createdAt", "lastSeenAt", "platform"]);
    assert.ok(!JSON.stringify(exp.body).includes(t), "tokenet står ikke i eksporten");
  });
});
