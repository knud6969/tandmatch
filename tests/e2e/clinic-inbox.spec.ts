import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../lib/constants/consents";

// Klinikkens indbakke og lead-kort (arbejdsplan 5.3): klinik ser lead -> stiller spørgsmål -> patienten ser og svarer -> klinikken
// accepterer med kommentar og pris -> patienten ser status og pris. Desuden: klinik Y kan ikke åbne X's lead (UI og API), patientens
// navn og kontakt vises ikke, afvisning med årsag vises for patienten, og et tilbagetrukket lead viser kun status.
// Klinikker og patienter oprettes via API'et; klinikkerne verificeres direkte i den LOKALE database (som i leads-limits.spec.ts).

const PASSWORD = "test-adgangskode-123";
const PATIENT_NAME = "Lea";
const DB_URL = process.env.TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const HORIZONTAL_SCROLL = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(HORIZONTAL_SCROLL)).toBeLessThanOrEqual(0);
}

function sql(query: string): string {
  if (!/^postgresql:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(DB_URL)) throw new Error("Afviser: TEST_DB_URL peger ikke på lokal database.");
  return execFileSync("psql", [DB_URL, "-At", "-q", "-c", query], { encoding: "utf8" }).trim();
}

function fakeIp(): string {
  return `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
}

async function newPage(browser: Browser, testInfo: TestInfo): Promise<Page> {
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

type ClinicHandle = { page: Page; id: string; name: string };

async function verifiedClinic(browser: Browser, testInfo: TestInfo, label: string, verify = true): Promise<ClinicHandle> {
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
async function patientWithCase(browser: Browser, testInfo: TestInfo): Promise<{ page: Page; caseId: string }> {
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

async function sendTo(patient: { page: Page; caseId: string }, clinics: ClinicHandle[]): Promise<string[]> {
  const sent = await patient.page.request.post(`/api/cases/${patient.caseId}/leads`, { data: { clinicIds: clinics.map((c) => c.id) } });
  expect(sent.status(), await sent.text()).toBe(201);
  const body = (await sent.json()) as { leads: { id: string; clinic: { id: string } }[] };
  return clinics.map((c) => body.leads.find((l) => l.clinic.id === c.id)!.id);
}

function addListPrice(clinicId: string) {
  sql(
    `set session_replication_role = replica; insert into public.clinic_prices (clinic_id, service_id, price_min, price_max, duration_min) select '${clinicId}', id, 500, 900, 30 from public.services where slug = 'blegning'`,
  );
}

async function cleanup(patient: { page: Page } | null, clinics: ClinicHandle[]) {
  if (patient) {
    await patient.page.request.delete("/api/patients/me", { data: { confirm: "SLET" } }).catch(() => undefined);
    await patient.page.context().close();
  }
  for (const clinic of clinics) {
    await clinic.page.request.delete("/api/clinics/me", { data: { confirm: "SLET" } }).catch(() => undefined);
    await clinic.page.context().close();
  }
}

test.describe("klinikkens indbakke og lead-kort", () => {
  test.setTimeout(120_000);

  test("spørgsmål, svar og accept med kommentar og pris", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const patient = await patientWithCase(browser, testInfo);
    try {
      addListPrice(x.id);
      const [leadId] = await sendTo(patient, [x]);

      // Indbakken: ét nyt lead med behandling, område og "Ny".
      await x.page.goto("/klinik");
      const row = x.page.getByTestId("lead-raekke");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("Ny");
      await expect(row).toContainText("Venter på dit svar");
      await expect(row).toContainText("Blegning");
      await expect(row).toContainText("2100");
      await expectNoHorizontalScroll(x.page);
      await x.page.screenshot({ path: `test-results/indbakke-${x.page.viewportSize()!.width}.png`, fullPage: true });

      // Lead-kortet: alt relevant, ingen patientidentitet.
      await row.click();
      await expect(x.page).toHaveURL(new RegExp(`/klinik/lead/${leadId}$`));
      await expect(x.page.getByRole("heading", { level: 1 })).toContainText("Blegning");
      await expect(x.page.getByTestId("opsummering")).toHaveText("Jeg vil gerne have lysere tænder.");
      await expect(x.page.getByText("500–900 kr.")).toBeVisible();
      await expect(x.page.getByText("ifølge klinikkens prisliste").first()).toBeVisible();
      await expect(x.page.getByTestId("kontakt-skjult")).toBeVisible();
      const content = await x.page.locator("main").innerText();
      expect(content).not.toContain(PATIENT_NAME);
      expect(content).not.toMatch(/@example\.com/);
      for (const name of ["Accepter", "Accepter med kommentar", "Afvis"]) {
        const button = x.page.getByRole("button", { name, exact: true });
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expectNoHorizontalScroll(x.page);
      await x.page.screenshot({ path: `test-results/lead-kort-${x.page.viewportSize()!.width}.png`, fullPage: true });

      // Klinikken stiller et spørgsmål før beslutningen.
      await expect(x.page.getByText(/kan se dine beskeder/)).toBeVisible();
      await x.page.getByLabel("Skriv en besked").fill("Har du været til tandlæge det seneste år?");
      await x.page.getByRole("button", { name: "Send besked" }).click();
      await expect(x.page.getByTestId("besked")).toHaveCount(1);
      await expect(x.page.getByTestId("besked")).toContainText("Har du været til tandlæge det seneste år?");

      // Patienten ser en ulæst besked fra "Klinikken" og svarer.
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      await expect(patient.page.getByTestId("ulaeste")).toHaveText("1 ulæst");
      await patient.page.getByRole("button", { name: /^Beskeder/ }).click();
      await expect(patient.page.getByTestId("besked")).toHaveCount(1);
      await expect(patient.page.getByTestId("besked")).toContainText("Klinikken");
      await expect(patient.page.getByTestId("besked")).toContainText("Har du været til tandlæge det seneste år?");
      await patient.page.getByLabel("Skriv en besked").fill("Ja, for et halvt år siden.");
      await patient.page.getByRole("button", { name: "Send besked" }).click();
      await expect(patient.page.getByTestId("besked")).toHaveCount(2);
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/sag-beskeder-${patient.page.viewportSize()!.width}.png`, fullPage: true });

      // Klinikkens åbne tråd henter svaret af sig selv (polling hvert 15. sekund).
      await expect(x.page.getByTestId("besked")).toHaveCount(2, { timeout: 30_000 });
      await expect(x.page.getByTestId("besked").nth(1)).toContainText("Patienten");

      // Accepter med kommentar og præciseret pris: ét tryk til at åbne og ét til at sende.
      await x.page.getByRole("button", { name: "Accepter med kommentar", exact: true }).click();
      await x.page.getByLabel("Kommentar til patienten").fill("Vi kan klare det på én time. Husk at medbringe sundhedskortet.");
      await x.page.getByLabel("Laveste pris (kr.)").fill("700");
      await x.page.getByLabel("Højeste pris (kr.)").fill("1100");
      await expectNoHorizontalScroll(x.page);
      await x.page.screenshot({ path: `test-results/lead-accept-${x.page.viewportSize()!.width}.png`, fullPage: true });
      await x.page.getByRole("button", { name: "Send og accepter" }).click();
      await expect(x.page.getByTestId("dit-svar")).toContainText("Du har accepteret henvendelsen");
      await expect(x.page.getByTestId("dit-svar")).toContainText("700–1.100 kr.");
      await expect(x.page.getByTestId("kontakt-skjult")).toBeVisible();

      // Patienten ser status, kommentar og klinikkens pris.
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      const lead = patient.page.getByTestId("lead");
      await expect(lead).toContainText("Accepteret");
      await expect(lead).toContainText("700–1.100 kr.");
      await expect(lead).toContainText("Vi kan klare det på én time");
      await expectNoHorizontalScroll(patient.page);

      // Leadet er nu besvaret i indbakken.
      await x.page.goto("/klinik");
      await expect(x.page.getByTestId("lead-raekke")).toHaveCount(1);
      await expect(x.page.getByTestId("lead-raekke")).toContainText("Accepteret");
      await expect(x.page.getByTestId("lead-raekke")).not.toContainText("Ny");
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("klinik Y kan ikke se eller åbne X's lead, og navn og kontakt vises ikke", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const y = await verifiedClinic(browser, testInfo, "y");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);

      // UI: Y's indbakke er tom, og X's lead giver "ikke fundet" uden indhold.
      await y.page.goto("/klinik");
      await expect(y.page.getByTestId("ingen-henvendelser")).toBeVisible();
      await expect(y.page.getByTestId("lead-raekke")).toHaveCount(0);
      await y.page.goto(`/klinik/lead/${leadId}`);
      await expect(y.page.getByRole("alert")).toBeVisible();
      await expect(y.page.getByTestId("opsummering")).toHaveCount(0);
      await expect(y.page.getByRole("button", { name: "Accepter", exact: true })).toHaveCount(0);
      await expectNoHorizontalScroll(y.page);

      // API: Y kan hverken læse, besvare eller skrive i X's lead, og listen er tom.
      expect((await y.page.request.get(`/api/leads/${leadId}`)).status()).toBe(404);
      expect((await y.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "accept" } })).status()).toBe(404);
      expect([403, 404]).toContain((await y.page.request.get(`/api/leads/${leadId}/messages`)).status());
      expect([403, 404]).toContain((await y.page.request.post(`/api/leads/${leadId}/messages`, { data: { body: "Hej" } })).status());
      const list = (await (await y.page.request.get("/api/leads")).json()) as { leads: unknown[] };
      expect(list.leads).toHaveLength(0);

      // X's leadet er urørt, og kortet viser hverken navn eller kontakt.
      await x.page.goto(`/klinik/lead/${leadId}`);
      await expect(x.page.getByRole("button", { name: "Accepter", exact: true })).toBeVisible();
      const detail = await (await x.page.request.get(`/api/leads/${leadId}`)).text();
      expect(detail).not.toContain(PATIENT_NAME);
      expect(detail).not.toMatch(/example\.com/);
      expect(await x.page.locator("main").innerText()).not.toContain(PATIENT_NAME);
    } finally {
      await cleanup(patient, [x, y]);
    }
  });

  test("afvisning med årsag og note vises for patienten, og tråden er lukket", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);
      await x.page.goto(`/klinik/lead/${leadId}`);
      await x.page.getByRole("button", { name: "Afvis", exact: true }).click();
      // clinic_left kan ikke vælges.
      const options = await x.page.getByLabel("Årsag").locator("option").allTextContents();
      expect(options).toHaveLength(4);
      expect(options.join(" ")).not.toContain("ikke længere på TandMatch");
      await expect(x.page.getByText(/Patienten kan se både årsagen og noten/)).toBeVisible();
      await x.page.getByLabel("Årsag").selectOption("needs_referral");
      await x.page.getByLabel("Note til patienten (valgfri)").fill("Kontakt din læge for en henvisning.");
      await expectNoHorizontalScroll(x.page);
      await x.page.getByRole("button", { name: "Send afvisning" }).click();
      await expect(x.page.getByTestId("dit-svar")).toContainText("Du har afvist henvendelsen");
      await expect(x.page.getByTestId("dit-svar")).toContainText("Behandlingen kræver henvisning");
      await expect(x.page.getByTestId("traad-lukket")).toBeVisible();
      await expect(x.page.getByLabel("Skriv en besked")).toHaveCount(0);

      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      const lead = patient.page.getByTestId("lead");
      await expect(lead).toContainText("Afvist");
      await expect(lead).toContainText("Behandlingen kræver henvisning");
      await expect(lead.getByTestId("afvisning")).toContainText("Kontakt din læge for en henvisning.");
      await patient.page.getByRole("button", { name: /^Beskeder/ }).click();
      await expect(patient.page.getByTestId("traad-lukket")).toBeVisible();
      await expect(patient.page.getByLabel("Skriv en besked")).toHaveCount(0);
      await expectNoHorizontalScroll(patient.page);

      // Allerede besvaret: en ny beslutning afvises.
      const again = await x.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "accept" } });
      expect(again.status()).toBe(409);
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("tilbagetrukket lead viser kun status", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);
      expect((await patient.page.request.post(`/api/leads/${leadId}/withdraw`, { data: {} })).ok()).toBeTruthy();

      await x.page.goto("/klinik");
      const row = x.page.getByTestId("lead-raekke");
      await expect(x.page.getByRole("button", { name: /^Trukket tilbage/ })).toBeVisible();
      await x.page.getByRole("button", { name: /^Trukket tilbage/ }).click();
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("Patienten har trukket henvendelsen tilbage");
      await expect(row).not.toContainText("Blegning");
      await expectNoHorizontalScroll(x.page);

      await row.click();
      await expect(x.page.getByTestId("tilbagetrukket")).toHaveText("Patienten har trukket henvendelsen tilbage");
      await expect(x.page.getByTestId("opsummering")).toHaveCount(0);
      await expect(x.page.getByRole("button", { name: "Accepter", exact: true })).toHaveCount(0);
      await expect(x.page.getByLabel("Skriv en besked")).toHaveCount(0);
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("en ikke-verificeret klinik ser én forklaring (banneret) og en kort tekst i indbakken, ikke en fejl", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "u", false);
    try {
      await x.page.goto("/klinik");
      await expect(x.page.getByText("Afventer verificering", { exact: true })).toHaveCount(1);
      await expect(x.page.getByTestId("ingen-henvendelser")).toContainText("før klinikken er verificeret");
      await expect(x.page.getByText("Indbakken åbner, når klinikken er verificeret")).toHaveCount(0);
      await expect(x.page.getByRole("status").filter({ hasText: /verific/i })).toHaveCount(1);
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(null, [x]);
    }
  });
});
