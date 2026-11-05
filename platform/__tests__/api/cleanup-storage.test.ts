// API-test for /api/cron/cleanup-storage og køen pending_storage_paths (security M3 og M4; platform/README.md 4.3).
// Kører mod en rigtig app + lokal Supabase. Filerne ligger under en mappe, der kun bruges af testen.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BASE_URL, TestClient, adminClient } from "../../../tests/api/helpers.ts";

assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", /^http:\/\/(127\.0\.0\.1|localhost):/, "kun lokal Supabase");

const admin = adminClient();
const url = "/api/cron/cleanup-storage";
const secret = { authorization: `Bearer ${process.env.CRON_SECRET}` };
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

async function put(bucket: string, path: string): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(path, BYTES, { contentType: "image/jpeg", upsert: true });
  assert.ifError(error);
}
async function exists(bucket: string, path: string): Promise<boolean> {
  const dir = path.split("/").slice(0, -1).join("/");
  const { data } = await admin.storage.from(bucket).list(dir);
  return (data ?? []).some((f) => f.name === path.split("/").at(-1));
}
async function queued(path: string): Promise<number> {
  const { count } = await admin.from("pending_storage_paths").select("id", { count: "exact", head: true }).eq("path", path);
  return count ?? 0;
}

describe("/api/cron/cleanup-storage", () => {
  it("401 uden secret, med forkert secret og uden Bearer", async () => {
    const c = new TestClient();
    assert.equal((await c.post(url)).status, 401);
    assert.equal((await c.post(url, {}, { authorization: "Bearer forkert-forkert-forkert" })).status, 401);
    assert.equal((await c.post(url, {}, { authorization: process.env.CRON_SECRET! })).status, 401);
    assert.equal((await fetch(BASE_URL + url)).status, 401);
  });

  it("tømmer køen: sletter filer og mapper og fjerner posterne (GET og POST)", async () => {
    const dir = `cleanup-test-${crypto.randomUUID()}`;
    const single = `${dir}/en.jpg`;
    const folder = `${dir}-mappe`;
    await put("case-images", single);
    await put("case-images", `${folder}/a.jpg`);
    await put("case-images", `${folder}/under/b.jpg`);
    await put("public-media", `${dir}/offentlig.jpg`);
    assert.ifError((await admin.from("pending_storage_paths").insert([
      { bucket: "case-images", path: single, is_prefix: false },
      { bucket: "case-images", path: folder, is_prefix: true },
      { bucket: "public-media", path: `${dir}/offentlig.jpg`, is_prefix: false },
    ])).error);

    const r = await new TestClient().post(url, {}, secret);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ["failed", "purgedMessageImages", "removed"]);
    assert.ok(r.body.removed >= 3);
    assert.equal(r.body.failed, 0);
    assert.equal(await exists("case-images", single), false);
    assert.equal(await exists("case-images", `${folder}/a.jpg`), false);
    assert.equal(await exists("case-images", `${folder}/under/b.jpg`), false);
    assert.equal(await exists("public-media", `${dir}/offentlig.jpg`), false);
    for (const path of [single, folder, `${dir}/offentlig.jpg`]) assert.equal(await queued(path), 0);

    // Vercel Cron kalder med GET.
    const viaGet = await fetch(BASE_URL + url, { headers: secret });
    assert.equal(viaGet.status, 200);
  });

  it("en sti uden fil (allerede slettet) er ikke en fejl og fjernes fra køen", async () => {
    const path = `cleanup-test-${crypto.randomUUID()}/borte.jpg`;
    assert.ifError((await admin.from("pending_storage_paths").insert({ bucket: "case-images", path })).error);
    const r = await new TestClient().post(url, {}, secret);
    assert.equal(r.status, 200);
    assert.equal(await queued(path), 0);
  });

  it("klienter kan ikke se eller skrive i køen", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anon = await client.auth.signInAnonymously();
    assert.ifError(anon.error);
    try {
      const read = await client.from("pending_storage_paths").select("id");
      assert.ok(read.error !== null || (read.data ?? []).length === 0);
      const write = await client.from("pending_storage_paths").insert({ bucket: "case-images", path: "x/y.jpg" });
      assert.ok(write.error !== null);
    } finally {
      await admin.auth.admin.deleteUser(anon.data.user!.id).catch(() => {});
    }
  });
});
