import { execFileSync } from "node:child_process";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../../lib/constants/consents";

// Fælles hjælpere til indbakke-testene (kopi af hjælperne i ../clinic-inbox.spec.ts, som bevares uændret).
export const PASSWORD = "test-adgangskode-123";
export const PATIENT_NAME = "Lea";
const DB_URL = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const HORIZONTAL_SCROLL = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

export async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(HORIZONTAL_SCROLL)).toBeLessThanOrEqual(0);
}

export function sql(query: string): string {
  if (!/^postgresql:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(DB_URL)) throw new Error("Afviser: TEST_DB_URL peger ikke på lokal database.");
  return execFileSync("psql", [DB_URL, "-At", "-q", "-c", query], { encoding: "utf8" }).trim();
}

export function fakeIp(): string {
  return `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
}

export async function newPage(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const { baseURL, viewport } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, locale: "da-DK", extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const page = await context.newPage();
  await page.goto("/klinikker");
  if (/\/vilkaar\/accepter/.test(page.url())) {
    await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
  }
  return page;
}

export type ClinicHandle = { page: Page; id: string; name: string };

export async function verifiedClinic(browser: Browser, testInfo: TestInfo, label: string, verify = true): Promise<ClinicHandle> {
  const page = await newPage(browser, testInfo);
  const name = `Indbakketest ${label} ${Date.now()}`;
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      role: "clinic",
      email: `e2e-indbakke-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
      password: PASSWORD,
      cvr: String(10000000 + Math.floor(Math.random() * 89999999)),
      clinicName: name,
      address: "Testvej 1",
      postalCode: "2100",
      city: "København Ø",
      phone: "12345678",
    },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const me = (await (await page.request.get("/api/me")).json()) as { clinic: { id: string } };
  if (verify) sql(`select public.admin_set_clinic_status('${me.clinic.id}', 'verified')`);
  return { page, id: me.clinic.id, name };
}

// Patient med konto og en sendt-klar sag (blegning, godkendt opsummering, samtykke til deling).
export async function patientWithCase(browser: Browser, testInfo: TestInfo): Promise<{ page: Page; caseId: string }> {
  const page = await newPage(browser, testInfo);
  const signup = await page.request.post("/api/auth/signup", {
    data: { role: "patient", email: `e2e-indbakke-p-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`, password: PASSWORD, firstName: PATIENT_NAME },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const created = await page.request.post("/api/cases");
  const { id: caseId } = (await created.json()) as { id: string };
  const catalog = (await (await page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
  const service = catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning")!;
  for (const step of [
    page.request.put(`/api/cases/${caseId}/services`, { data: { services: [{ serviceId: service.id, suggestedByAi: false }] } }),
    page.request.patch(`/api/cases/${caseId}`, { data: { postalCode: "2100", preferredTimeframe: "within_2_weeks" } }),
    page.request.put(`/api/cases/${caseId}/summary`, { data: { summaryText: "Jeg vil gerne have lysere tænder." } }),
  ]) {
    expect((await step).ok()).toBeTruthy();
  }
  const consent = await page.request.post("/api/consents", {
    data: { type: "health_data_sharing", textVersion: CONSENT_TEXT_VERSIONS.health_data_sharing },
  });
  expect(consent.status()).toBe(201);
  return { page, caseId };
}

export async function sendTo(patient: { page: Page; caseId: string }, clinics: ClinicHandle[]): Promise<string[]> {
  const sent = await patient.page.request.post(`/api/cases/${patient.caseId}/leads`, { data: { clinicIds: clinics.map((c) => c.id) } });
  expect(sent.status(), await sent.text()).toBe(201);
  const body = (await sent.json()) as { leads: { id: string; clinic: { id: string } }[] };
  return clinics.map((c) => body.leads.find((l) => l.clinic.id === c.id)!.id);
}

export function addListPrice(clinicId: string) {
  sql(
    `set session_replication_role = replica; insert into public.clinic_prices (clinic_id, service_id, price_min, price_max, duration_min) select '${clinicId}', id, 500, 900, 30 from public.services where slug = 'blegning'`,
  );
}

export async function cleanup(patient: { page: Page } | null, clinics: ClinicHandle[]) {
  if (patient) {
    await patient.page.request.delete("/api/patients/me", { data: { confirm: "SLET" } }).catch(() => undefined);
    await patient.page.context().close();
  }
  for (const clinic of clinics) {
    await clinic.page.request.delete("/api/clinics/me", { data: { confirm: "SLET" } }).catch(() => undefined);
    await clinic.page.context().close();
  }
}

