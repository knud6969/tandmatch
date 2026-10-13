// Hjælpere til API-tests mod den lokale app + lokale Supabase (startes af tests/api/run.sh).
// Hver TestClient har sin egen cookie-jar og et unikt falsk klient-IP, så IP-rate limit (10/time) ikke rammes.
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3101";
export const TERMS_VERSION = "v0-prototype";
export const PRIVACY_VERSION = "v0-prototype";
export const AI_CONSENT_VERSION = "ai_processing@v0-prototype";
export const IMAGE_CONSENT_VERSION = "image_upload@v1-ai-disclosure";
export const SHARING_CONSENT_VERSION = "health_data_sharing@v0-prototype";

export type Json = Record<string, unknown>;
// Svarets JSON læses frit i testene; skemaet tjekkes af assertions, ikke af typerne.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Res = { status: number; body: any; headers: Headers };

export class TestClient {
  readonly cookies = new Map<string, string>();
  readonly ip = `10.${rnd()}.${rnd()}.${rnd()}`;

  async request(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Res> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...extraHeaders };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const isForm = body instanceof FormData;
    if (body !== undefined && !isForm) headers["content-type"] = "application/json";
    const res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      redirect: "manual",
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      const lower = attrs.map((a) => a.trim().toLowerCase());
      const expired = value === "" || lower.includes("max-age=0") || lower.some((a) => a.startsWith("max-age=-"));
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  get(path: string) {
    return this.request("GET", path);
  }
  post(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request("POST", path, body ?? {}, headers);
  }
  put(path: string, body: unknown) {
    return this.request("PUT", path, body);
  }
  patch(path: string, body: unknown) {
    return this.request("PATCH", path, body);
  }
  del(path: string, body?: unknown) {
    return this.request("DELETE", path, body);
  }
  // Multipart (billedupload). fetch sætter selv content-type med boundary.
  postForm(path: string, form: FormData) {
    return this.request("POST", path, form);
  }

  acceptTerms() {
    return this.post("/api/terms/accept", { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
  }
  startAnonymous() {
    return this.post("/api/session/anonymous", { aiConsent: { textVersion: AI_CONSENT_VERSION } });
  }
}

function rnd(): number {
  return 1 + Math.floor(Math.random() * 250);
}

export async function newClientWithTerms(): Promise<TestClient> {
  const c = new TestClient();
  const r = await c.acceptTerms();
  if (r.status !== 200) throw new Error(`terms/accept fejlede: ${r.status}`);
  return c;
}

export function uniqueEmail(prefix = "patient"): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

export const PASSWORD = "testpassword-123";

export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Signerer en vilkårs-cookie med en vilkårlig hemmelighed (til at teste forfalskning).
export function forgeTermsCookie(secret: string): string {
  const b64 = (b: Buffer) => b.toString("base64url");
  const body = b64(
    Buffer.from(
      JSON.stringify({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: new Date().toISOString() }),
    ),
  );
  return `${body}.${b64(createHmac("sha256", secret).update(body).digest())}`;
}

// Et lille, ægte JPEG-billede med EXIF-data (ophavsret), til upload-tests af logo, portræt og portefølje.
export async function jpegWithExif(): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 60, b: 60 } } })
    .withExif({ IFD0: { Copyright: "hemmelig-ophavsret" } })
    .jpeg()
    .toBuffer();
}

export function imageForm(image: Buffer, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "billede.jpg");
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

// Tilfældigt 8-cifret CVR-nummer, der ikke findes i CVR-registret (testdata).
export function randomCvr(): string {
  return String(10_000_000 + Math.floor(Math.random() * 89_999_999));
}
