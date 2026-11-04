// API-tests for gemte klinikker (clinics 4.3, 10.17; RLS-punkt 58). Fiktive klinikker og patienter, ryddes til sidst.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD, TestClient, adminClient, newClientWithTerms, randomCvr, uniqueEmail } from "../../../../tests/api/helpers.ts";

assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^http:\/\/(127\.0\.0\.1|localhost):/, "kun lokal Supabase");

const admin = adminClient();
const createdUserIds = new Set<string>();

after(async () => {
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
});

type Clinic = { c: TestClient; id: string; name: string };

async function clinic(status: "verified" | "registered" = "verified"): Promise<Clinic> {
  const c = await newClientWithTerms();
  const name = `Favorittest ${Math.random().toString(36).slice(2, 8)}`;
  const r = await c.post("/api/auth/signup", {
    role: "clinic",
    email: uniqueEmail("klinik"),
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
  assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: id, p_status: status })).error);
  return { c, id, name };
}

const patientIds = new WeakMap<TestClient, string>();
async function patient(): Promise<TestClient> {
  const c = await newClientWithTerms();
  const s = await c.post("/api/auth/signup", { role: "patient", email: uniqueEmail(), password: PASSWORD, firstName: "Lea" });
  assert.equal(s.status, 201);
  createdUserIds.add(s.body.userId);
  patientIds.set(c, s.body.userId);
  return c;
}

const put = (c: TestClient, id: string) => c.request("PUT", `/api/favorites/${id}`);
const code = (r: { body: unknown }) => (r.body as { error?: { code: string } }).error?.code;

describe("gemte klinikker", () => {
  it("PUT to gange giver én række; ids og liste viser klinikken; DELETE er idempotent", async () => {
    const k = await clinic();
    const p = await patient();
    assert.equal((await put(p, k.id)).status, 204);
    assert.equal((await put(p, k.id)).status, 204);
    const ids = await p.get("/api/favorites/ids");
    assert.equal(ids.status, 200);
    assert.deepEqual(ids.body.clinicIds, [k.id]);
    const list = await p.get("/api/favorites");
    assert.equal(list.status, 200);
    assert.equal(list.body.clinics.length, 1);
    const item = list.body.clinics[0];
    assert.equal(item.id, k.id);
    assert.equal(item.name, k.name);
    assert.deepEqual(item.prices, []);
    assert.equal(item.priceForSelection, null);
    assert.equal(item.distanceKm, null);
    assert.equal((await p.del(`/api/favorites/${k.id}`)).status, 204);
    assert.equal((await p.del(`/api/favorites/${k.id}`)).status, 204);
    assert.deepEqual((await p.get("/api/favorites/ids")).body.clinicIds, []);
    assert.deepEqual((await p.get("/api/favorites")).body.clinics, []);
  });

  it("en klinik, der ikke vises offentligt, giver 404 og vises ikke; en klinik, der bliver usynlig, udelades", async () => {
    const hidden = await clinic("registered");
    const p = await patient();
    const r = await put(p, hidden.id);
    assert.equal(r.status, 404);
    assert.deepEqual((await p.get("/api/favorites/ids")).body.clinicIds, []);

    const k = await clinic();
    assert.equal((await put(p, k.id)).status, 204);
    assert.ifError((await admin.rpc("admin_set_clinic_status", { p_clinic_id: k.id, p_status: "registered" })).error);
    assert.deepEqual((await p.get("/api/favorites/ids")).body.clinicIds, []);
    assert.deepEqual((await p.get("/api/favorites")).body.clinics, []);
    assert.equal((await put(p, "00000000-0000-4000-8000-000000000000")).status, 404);
  });

  it("ugyldigt id giver 400 VALIDATION_ERROR", async () => {
    const p = await patient();
    const r = await put(p, "ikke-et-id");
    assert.equal(r.status, 400);
    assert.equal(code(r), "VALIDATION_ERROR");
  });

  it("anonym får 403 ACCOUNT_REQUIRED, klinik 403, og patient A ser ikke B's favoritter", async () => {
    const k = await clinic();
    const anon = await newClientWithTerms();
    assert.equal((await anon.startAnonymous()).status, 201);
    for (const r of [await anon.get("/api/favorites"), await anon.get("/api/favorites/ids"), await put(anon, k.id)]) {
      assert.equal(r.status, 403);
      assert.equal(code(r), "ACCOUNT_REQUIRED");
    }
    assert.equal((await k.c.get("/api/favorites")).status, 403);
    assert.equal((await put(k.c, k.id)).status, 403);

    const a = await patient();
    const b = await patient();
    assert.equal((await put(a, k.id)).status, 204);
    assert.deepEqual((await b.get("/api/favorites/ids")).body.clinicIds, []);
    assert.equal((await b.del(`/api/favorites/${k.id}`)).status, 204);
    assert.deepEqual((await a.get("/api/favorites/ids")).body.clinicIds, [k.id]);
  });

  it("loftet på 200 giver 429 FAVORITE_LIMIT, men en allerede gemt klinik kan stadig gemmes", async () => {
    const p = await patient();
    const patientId = patientIds.get(p)!;
    const rows = Array.from({ length: 200 }, (_, i) => ({
      status: "imported",
      cvr: String(70000000 + i + Math.floor(Math.random() * 1000) * 1000),
      name: `Fiktiv favorit ${i}`,
      address: "Vej 1",
      postal_code: "2100",
      city: "København Ø",
    }));
    const inserted = await admin.from("clinics").insert(rows).select("id");
    assert.ifError(inserted.error);
    try {
      const ids = inserted.data!.map((row) => row.id as string);
      assert.ifError((await admin.from("favorite_clinics").insert(ids.map((id) => ({ patient_id: patientId, clinic_id: id })))).error);
      const extra = await clinic();
      const over = await put(p, extra.id);
      assert.equal(over.status, 429);
      assert.equal(code(over), "FAVORITE_LIMIT");
      assert.equal((await put(p, ids[0])).status, 204);
    } finally {
      await admin.from("favorite_clinics").delete().eq("patient_id", patientId);
      await admin.from("clinics").delete().in("id", inserted.data!.map((row) => row.id as string));
    }
  });

  it("dataeksporten har favorites", async () => {
    const k = await clinic();
    const p = await patient();
    await put(p, k.id);
    const exp = await p.get("/api/patients/me/export");
    assert.equal(exp.status, 200, JSON.stringify(exp.body));
    assert.equal(exp.body.favorites.length, 1);
    assert.deepEqual(Object.keys(exp.body.favorites[0]).sort(), ["clinicId", "createdAt"]);
    assert.equal(exp.body.favorites[0].clinicId, k.id);
  });
});
