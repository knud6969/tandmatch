import "server-only";
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type KeyObject } from "node:crypto";

// Web push uden npm-pakke: kryptering af beskeden efter RFC 8291 (aes128gcm, ECDH P-256, HKDF) og VAPID-signering efter
// RFC 8292 (JWT ES256). Rene funktioner uden netværk og uden tilstand (platform 14.6).

const RECORD_SIZE = 4096;
// RFC 8030: push-tjenesten skal acceptere mindst 4096 byte i alt. Headeren fylder 86 byte, tagget 16 og afgrænseren 1.
export const MAX_WEB_PUSH_PLAINTEXT_BYTES = RECORD_SIZE - 86 - 16 - 1;

export function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export type EncryptInput = {
  plaintext: Buffer;
  userPublicKey: Buffer; // abonnementets p256dh (65 byte, ukomprimeret P-256-punkt)
  authSecret: Buffer; // abonnementets auth (16 byte)
  // Kun til test med RFC 8291 bilag A. I drift vælges de tilfældigt pr. besked.
  salt?: Buffer;
  ephemeralPrivateKey?: Buffer;
};

// Krypterer én besked til én browser og returnerer hele bodyen (header + chiffertekst) til Content-Encoding: aes128gcm.
export function encryptWebPushPayload(input: EncryptInput): Buffer {
  const { plaintext, userPublicKey, authSecret } = input;
  if (userPublicKey.length !== 65 || userPublicKey[0] !== 0x04) throw new Error("p256dh skal være et ukomprimeret P-256-punkt");
  if (authSecret.length !== 16) throw new Error("auth skal være 16 byte");
  if (plaintext.length > MAX_WEB_PUSH_PLAINTEXT_BYTES) throw new Error("beskeden er for lang");

  const salt = input.salt ?? randomBytes(16);
  const ecdh = createECDH("prime256v1");
  if (input.ephemeralPrivateKey) ecdh.setPrivateKey(input.ephemeralPrivateKey);
  else ecdh.generateKeys();
  const serverPublicKey = ecdh.getPublicKey(); // 65 byte
  const sharedSecret = ecdh.computeSecret(userPublicKey);

  // RFC 8291 3.4: IKM = HKDF(salt = auth_secret, ikm = ecdh_secret, info = "WebPush: info" 0x00 ua_public as_public, L = 32).
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), userPublicKey, serverPublicKey]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  // RFC 8188 2.2-2.3: indholdsnøgle og nonce.
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12));

  // Én post: beskeden og afgrænseren 0x02 (sidste post).
  const record = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(serverPublicKey.length, 20);
  return Buffer.concat([header, serverPublicKey, ciphertext]);
}

// VAPID-nøglen (RFC 8292) som KeyObject. Den private nøgle er 32 byte (base64url), den offentlige 65 byte (base64url).
export function createVapidPrivateKey(privateKeyBase64Url: string, publicKeyBase64Url: string): KeyObject {
  const publicKey = base64UrlDecode(publicKeyBase64Url);
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) throw new Error("VAPID: ugyldig offentlig nøgle");
  if (base64UrlDecode(privateKeyBase64Url).length !== 32) throw new Error("VAPID: ugyldig privat nøgle");
  return createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(publicKey.subarray(1, 33)),
      y: base64UrlEncode(publicKey.subarray(33, 65)),
      d: privateKeyBase64Url,
    },
  });
}

export const VAPID_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60; // RFC 8292: højst 24 timer

// Authorization-headeren: `vapid t=<jwt>, k=<offentlig nøgle>`. `audience` er push-tjenestens origin.
export function createVapidAuthorization(input: {
  audience: string;
  subject: string;
  privateKey: KeyObject;
  publicKeyBase64Url: string;
  nowSeconds?: number;
}): string {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = base64UrlEncode(JSON.stringify({ aud: input.audience, exp: now + VAPID_TOKEN_LIFETIME_SECONDS, sub: input.subject }));
  const signingInput = `${header}.${claims}`;
  // ES256 kræver den rå r||s-form (64 byte), ikke DER.
  const signature = sign("sha256", Buffer.from(signingInput), { key: input.privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${input.publicKeyBase64Url}`;
}
