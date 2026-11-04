import { createDecipheriv, createECDH, generateKeyPairSync, hkdfSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  createVapidAuthorization,
  createVapidPrivateKey,
  encryptWebPushPayload,
  MAX_WEB_PUSH_PLAINTEXT_BYTES,
} from "@/platform/notifications/webPushCrypto";

vi.mock("server-only", () => ({}));

// Testvektorerne i RFC 8291, bilag A.
const RFC = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("RFC 8291 bilag A", () => {
  it("giver præcis den krypterede body fra bilaget", () => {
    const body = encryptWebPushPayload({
      plaintext: base64UrlDecode(RFC.plaintext),
      userPublicKey: base64UrlDecode(RFC.uaPublic),
      authSecret: base64UrlDecode(RFC.authSecret),
      salt: base64UrlDecode(RFC.salt),
      ephemeralPrivateKey: base64UrlDecode(RFC.asPrivate),
    });
    expect(base64UrlEncode(body)).toBe(RFC.body);
    expect(base64UrlDecode(RFC.plaintext).toString()).toBe("When I grow up, I want to be a watermelon");
  });

  it("afviser ugyldige nøgler og for lange beskeder", () => {
    const base = { userPublicKey: base64UrlDecode(RFC.uaPublic), authSecret: base64UrlDecode(RFC.authSecret) };
    expect(() => encryptWebPushPayload({ ...base, plaintext: Buffer.from("x"), userPublicKey: Buffer.alloc(65) })).toThrow();
    expect(() => encryptWebPushPayload({ ...base, plaintext: Buffer.from("x"), authSecret: Buffer.alloc(8) })).toThrow();
    expect(() => encryptWebPushPayload({ ...base, plaintext: Buffer.alloc(MAX_WEB_PUSH_PLAINTEXT_BYTES + 1) })).toThrow();
    expect(encryptWebPushPayload({ ...base, plaintext: Buffer.alloc(MAX_WEB_PUSH_PLAINTEXT_BYTES) }).length).toBeLessThanOrEqual(4096);
  });

  it("kan dekrypteres af modtageren med en tilfældig nøgle og salt", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = Buffer.from("0123456789abcdef");
    const body = encryptWebPushPayload({ plaintext: Buffer.from("hej"), userPublicKey: ua.getPublicKey(), authSecret: auth });
    const salt = body.subarray(0, 16);
    const serverPublic = body.subarray(21, 21 + body.readUInt8(20));
    const secret = ua.computeSecret(serverPublic);
    const ikm = Buffer.from(hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), serverPublic]), 32));
    const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
    const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
    const ct = body.subarray(21 + serverPublic.length);
    const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
    decipher.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
    expect(plain.toString("latin1")).toBe("hej\u0002");
    expect(body.readUInt32BE(16)).toBe(4096);
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signerer en JWT, som den offentlige nøgle kan verificere", () => {
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = pair.privateKey.export({ format: "jwk" });
    const publicKey = Buffer.concat([Buffer.from([4]), base64UrlDecode(jwk.x!), base64UrlDecode(jwk.y!)]);
    const publicB64 = base64UrlEncode(publicKey);
    const key = createVapidPrivateKey(jwk.d!, publicB64);
    const header = createVapidAuthorization({ audience: "https://push.example", subject: "mailto:test@example.com", privateKey: key, publicKeyBase64Url: publicB64, nowSeconds: 1_000_000 });
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^.]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h, c, sig, k] = match!;
    expect(k).toBe(publicB64);
    expect(JSON.parse(base64UrlDecode(h).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(base64UrlDecode(c).toString())).toEqual({ aud: "https://push.example", exp: 1_000_000 + 43_200, sub: "mailto:test@example.com" });
    expect(base64UrlDecode(sig).length).toBe(64);
    const ok = verify("sha256", Buffer.from(`${h}.${c}`), { key: pair.publicKey, dsaEncoding: "ieee-p1363" }, base64UrlDecode(sig));
    expect(ok).toBe(true);
  });

  it("afviser ugyldige nøgler", () => {
    expect(() => createVapidPrivateKey("kort", "kort")).toThrow();
  });
});
