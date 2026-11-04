import { createDecipheriv, createECDH, generateKeyPairSync, hkdfSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { VapidWebPushService } from "@/platform/notifications/vapidWebPushService";
import { base64UrlDecode, base64UrlEncode } from "@/platform/notifications/webPushCrypto";

vi.mock("server-only", () => ({}));

const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = pair.privateKey.export({ format: "jwk" });
const publicKey = base64UrlEncode(Buffer.concat([Buffer.from([4]), base64UrlDecode(jwk.x!), base64UrlDecode(jwk.y!)]));
const config = { publicKey, privateKey: jwk.d!, subject: "mailto:test@example.com" };

function browser() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = Buffer.from("abcdefghijklmnop");
  return {
    target: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: base64UrlEncode(ecdh.getPublicKey()), auth: base64UrlEncode(auth) },
    decrypt(body: Uint8Array): string {
      const buf = Buffer.from(body);
      const salt = buf.subarray(0, 16);
      const serverPublic = buf.subarray(21, 21 + buf.readUInt8(20));
      const secret = ecdh.computeSecret(serverPublic);
      const ikm = Buffer.from(hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), serverPublic]), 32));
      const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
      const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
      const ct = buf.subarray(21 + serverPublic.length);
      const d = createDecipheriv("aes-128-gcm", cek, nonce);
      d.setAuthTag(ct.subarray(ct.length - 16));
      return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString().slice(0, -1);
    },
  };
}

const content = { title: "TandMatch", body: "Ny henvendelse på TandMatch", data: { type: "clinic_new_lead" as const, path: "/klinik/lead/11111111-1111-4111-8111-111111111111" } };

describe("VapidWebPushService", () => {
  it("krypterer, signerer med VAPID og sender kun den generiske tekst og stien", async () => {
    const b = browser();
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    const [result] = await new VapidWebPushService(config, fetchMock as never).send([{ to: b.target, ...content }]);
    expect(result).toEqual({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(b.target.endpoint);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("86400");
    expect(headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(headers.Authorization.endsWith(`k=${publicKey}`)).toBe(true);
    expect(JSON.parse(b.decrypt(init.body as Uint8Array))).toEqual({ title: "TandMatch", body: content.body, path: content.data.path, type: "clinic_new_lead" });
    expect(init.redirect).toBe("error");
  });

  it("404 og 410 er invalid_target; 429/5xx retryable; øvrige 4xx ikke", async () => {
    const run = async (status: number) => (await new VapidWebPushService(config, vi.fn(async () => new Response(null, { status })) as never).send([{ to: browser().target, ...content }]))[0];
    expect(await run(404)).toEqual({ status: "invalid_target" });
    expect(await run(410)).toEqual({ status: "invalid_target" });
    expect(await run(429)).toEqual({ status: "error", code: "WEBPUSH_429", retryable: true });
    expect(await run(503)).toEqual({ status: "error", code: "WEBPUSH_503", retryable: true });
    expect(await run(400)).toEqual({ status: "error", code: "WEBPUSH_400", retryable: false });
    const net = await new VapidWebPushService(config, vi.fn(async () => { throw new Error("net"); }) as never).send([{ to: browser().target, ...content }]);
    expect(net[0]).toEqual({ status: "error", code: "WEBPUSH_NETWORK", retryable: true });
  });

  it("kalder aldrig en adresse uden for de kendte push-tjenester", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    const evil = { ...browser().target, endpoint: "https://169.254.169.254/latest/meta-data" };
    const http = { ...browser().target, endpoint: "http://fcm.googleapis.com/x" };
    const results = await new VapidWebPushService(config, fetchMock as never).send([{ to: evil, ...content }, { to: http, ...content }]);
    expect(results).toEqual([{ status: "invalid_target" }, { status: "invalid_target" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ugyldige nøgler i abonnementet giver invalid_target uden netværkskald", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    const [r] = await new VapidWebPushService(config, fetchMock as never).send([{ to: { endpoint: "https://fcm.googleapis.com/x", p256dh: "kort", auth: "kort" }, ...content }]);
    expect(r).toEqual({ status: "invalid_target" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
