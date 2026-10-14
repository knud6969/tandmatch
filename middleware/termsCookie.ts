import "server-only";
import { z } from "zod";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/constants/legal";

// Signeret cookie tm_terms (architecture 2.5). Format: base64url(payloadJSON) "." base64url(HMAC-SHA256).
// Bruger Web Crypto, så den kan køre i både proxy.ts og route handlers.
export const TERMS_COOKIE = "tm_terms";
export const TERMS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 12 måneder

const termsPayloadSchema = z.object({
  termsVersion: z.string().min(1).max(40),
  privacyVersion: z.string().min(1).max(40),
  acceptedAt: z.iso.datetime(),
});

export type TermsPayload = z.infer<typeof termsPayloadSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// Fail closed: mangler hemmeligheden, kan ingen cookie verificeres.
async function getKey(): Promise<CryptoKey> {
  const secret = process.env.TERMS_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("TERMS_COOKIE_SECRET mangler eller er for kort");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signTermsPayload(payload: TermsPayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

// Returnerer payload hvis signaturen er gyldig og formatet korrekt; ellers null. Versionen tjekkes ikke her.
async function verifyTermsCookie(value: string | undefined): Promise<TermsPayload | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const signatureBytes = fromBase64Url(signature);
  const bodyBytes = fromBase64Url(body);
  if (!signatureBytes || !bodyBytes) return null;

  try {
    const key = await getKey();
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(body));
    if (!valid) return null;
    const parsed = termsPayloadSchema.safeParse(JSON.parse(decoder.decode(bodyBytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isCurrentTerms(payload: TermsPayload): boolean {
  return payload.termsVersion === TERMS_VERSION && payload.privacyVersion === PRIVACY_VERSION;
}

// Gyldig, signeret og på de aktuelle versioner.
export async function verifyCurrentTermsCookie(value: string | undefined): Promise<TermsPayload | null> {
  const payload = await verifyTermsCookie(value);
  return payload && isCurrentTerms(payload) ? payload : null;
}
