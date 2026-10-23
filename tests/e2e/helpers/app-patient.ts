import { expect } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../../lib/identity/constants/consents";
import { PASSWORD, fakeIp } from "./inbox";

// Patienten som appen: ingen cookies, Authorization: Bearer, X-Terms-Token og X-TandMatch-Client: mobile (architecture 2.4-2.5, 13.3).
// Bruges i tværgående tests, hvor klinikken sidder i en rigtig browser på weben.
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3102";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRes = { status: number; body: any };

export class AppPatient {
  readonly ip = fakeIp();
  accessToken: string | null = null;
  termsToken: string | null = null;
  caseId = "";

  async request(method: string, path: string, body?: unknown): Promise<ApiRes> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, "X-TandMatch-Client": "mobile", Accept: "application/json" };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (this.termsToken) headers["X-Terms-Token"] = this.termsToken;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }
  get(path: string) {
    return this.request("GET", path);
  }
  post(path: string, body: unknown = {}) {
    return this.request("POST", path, body);
  }

  // Vilkår og patientkonto som appen (tokens kun i svaret, ingen cookies).
  static async signup(firstName = "Lea"): Promise<AppPatient> {
    const p = new AppPatient();
    const terms = await p.post("/api/terms/accept", { termsVersion: "v0-prototype", privacyVersion: "v0-prototype" });
    expect(terms.status, JSON.stringify(terms.body)).toBe(200);
    p.termsToken = terms.body.termsToken;
    const res = await p.post("/api/auth/signup", {
      role: "patient",
      email: `e2e-app-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
      password: PASSWORD,
      firstName,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    p.accessToken = res.body.session.accessToken;
    return p;
  }

  async serviceId(slug: string): Promise<string> {
    const catalog = await this.get("/api/services");
    expect(catalog.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return catalog.body.groups.flatMap((g: any) => g.services).find((s: { slug: string }) => s.slug === slug).id;
  }

  // Sag med blegning, postnummer, godkendt opsummering og samtykke til deling (som appens flow).
  async prepareCase(): Promise<string> {
    const created = await this.post("/api/cases");
    expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
    this.caseId = created.body.id;
    const serviceId = await this.serviceId("blegning");
    for (const [method, path, body] of [
      ["PUT", `/api/cases/${this.caseId}/services`, { services: [{ serviceId, suggestedByAi: false }] }],
      ["PATCH", `/api/cases/${this.caseId}`, { postalCode: "2100", preferredTimeframe: "within_2_weeks" }],
      ["PUT", `/api/cases/${this.caseId}/summary`, { summaryText: "Jeg vil gerne have lysere tænder." }],
    ] as const) {
      const r = await this.request(method, path, body);
      expect(r.status, `${method} ${path}: ${JSON.stringify(r.body)}`).toBeLessThan(300);
    }
    const consent = await this.post("/api/consents", { type: "health_data_sharing", textVersion: CONSENT_TEXT_VERSIONS.health_data_sharing });
    expect(consent.status, JSON.stringify(consent.body)).toBe(201);
    return this.caseId;
  }

  async deleteAccount() {
    await this.request("DELETE", "/api/patients/me", { confirm: "SLET" }).catch(() => undefined);
  }
}
