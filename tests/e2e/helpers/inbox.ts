import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../../lib/identity/constants/consents";

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


function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Ensfarvet PNG (pladsholder, ikke et rigtigt foto).
export function placeholderPng(size = 64, rgb: [number, number, number] = [120, 160, 220]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

// Samtykke til billedupload og `count` pladsholderbilleder på en endnu ikke sendt sag.
export async function addImages(patient: { page: Page; caseId: string }, count: number) {
  const consent = await patient.page.request.post("/api/consents", {
    data: { type: "image_upload", textVersion: CONSENT_TEXT_VERSIONS.image_upload },
  });
  expect(consent.status(), await consent.text()).toBe(201);
  for (let i = 0; i < count; i++) {
    const res = await patient.page.request.post(`/api/cases/${patient.caseId}/images`, {
      multipart: { file: { name: `tand-${i}.png`, mimeType: "image/png", buffer: placeholderPng(64, [100 + i * 20, 160, 220]) } },
    });
    expect(res.status(), await res.text()).toBe(201);
  }
  // Nye billeder fjerner godkendelsen af opsummeringen, så den godkendes igen.
  const approve = await patient.page.request.put(`/api/cases/${patient.caseId}/summary`, { data: { summaryText: "Jeg vil gerne have lysere tænder." } });
  expect(approve.ok(), await approve.text()).toBeTruthy();
}

// Kalenderen starter ved i dag; tidligere dage ligger bag en knap (6.7b). Åbner dem, hvis de findes.
export async function showPastDays(page: Page) {
  await expect(page.getByTestId("kalender-dag").first()).toBeVisible();
  const button = page.getByRole("button", { name: /^Vis tidligere dage/ });
  if (await button.count()) await button.click();
}
