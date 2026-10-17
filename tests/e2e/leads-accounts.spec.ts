import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../lib/constants/consents";

// Tillæg til leads-flow.spec.ts (arbejdsplan 4.4): (1) en patient, der allerede har konto (ikke anonym), vælger via "Vælg klinik" på
// profilen og sender uden at oprette konto; (2) patient B kan hverken se A's sag i UI'et eller læse/trække A's leads tilbage via API'et.
// Klinikkerne kommer fra demodata (`npm run seed:demo`).

const PASSWORD = "test-adgangskode-123";
const HORIZONTAL_SCROLL = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
const directoryParams = "services=blegning&postalCode=2100&maxDistanceKm=500";

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(HORIZONTAL_SCROLL)).toBeLessThanOrEqual(0);
}

async function newPatientPage(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const { baseURL, viewport } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, locale: "da-DK" });
  const page = await context.newPage();
  await page.goto("/klinikker");
  if (/\/vilkaar\/accepter/.test(page.url())) {
    await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
  }
  return page;
}

// Opretter en patient med konto via API'et (ingen anonym fase) og en sag, der er klar til at blive sendt.
async function signedUpPatientWithCase(page: Page, ready = true): Promise<string> {
  const email = `e2e-acct-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const signup = await page.request.post("/api/auth/signup", { data: { role: "patient", email, password: PASSWORD, firstName: "Test" } });
  expect(signup.status(), await signup.text()).toBe(201);
  const created = await page.request.post("/api/cases");
  expect(created.status()).toBe(201);
  const { id: caseId } = (await created.json()) as { id: string };
  if (!ready) return caseId;
  const catalog = (await (await page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
  const service = catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning")!;
  const steps = [
    page.request.put(`/api/cases/${caseId}/services`, { data: { services: [{ serviceId: service.id, suggestedByAi: false }] } }),
    page.request.patch(`/api/cases/${caseId}`, { data: { postalCode: "2100", preferredTimeframe: "within_2_weeks" } }),
    page.request.put(`/api/cases/${caseId}/summary`, { data: { summaryText: "Jeg vil gerne have lysere tænder." } }),
  ];
  for (const step of steps) expect((await step).ok()).toBeTruthy();
  const consent = await page.request.post("/api/consents", {
    data: { type: "health_data_sharing", textVersion: CONSENT_TEXT_VERSIONS.health_data_sharing },
  });
  expect(consent.status()).toBe(201);
  return caseId;
}

async function contactableClinics(page: Page): Promise<{ id: string; name: string }[]> {
  const list = (await (await page.request.get("/api/clinics?contactableOnly=true")).json()) as { clinics: { id: string; name: string }[] };
  expect(list.clinics.length).toBeGreaterThanOrEqual(4);
  return list.clinics;
}

async function deleteAccount(page: Page) {
  await page.request.delete("/api/patients/me", { data: { confirm: "SLET" } });
}

test.describe("leads: patient med konto og adgangsskel mellem patienter", () => {
  test("patient med konto vælger fra profilen og sender uden at oprette konto", async ({ browser }, testInfo) => {
    const page = await newPatientPage(browser, testInfo);
    try {
      const caseId = await signedUpPatientWithCase(page);
      const clinics = await contactableClinics(page);

      // "Vælg klinik" på den første profil
      await page.goto(`/klinikker/${clinics[0].id}?sag=${caseId}&${directoryParams}`);
      const choose = page.getByRole("button", { name: "Vælg klinik", exact: true });
      await expect(choose).toBeVisible();
      await expect(choose).toBeEnabled();
      expect((await choose.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/leads-profil-${page.viewportSize()!.width}.png` });
      await choose.click();
      await expect(page.getByText("1 af 3 mulige klinikker valgt")).toBeVisible();
      await expect(page.getByRole("button", { name: "Fjern valg af klinikken" })).toBeVisible();
      await expectNoHorizontalScroll(page);

      // Valget overlever turen tilbage til oversigten, og to flere kan vælges der
      await page.goto(`/klinikker?sag=${caseId}&${directoryParams}`);
      const boxes = page.getByRole("checkbox", { name: /Vælg til kontakt/ });
      await expect(page.getByTestId("valgte-antal")).toHaveText("1 af 3 mulige klinikker valgt");
      const checkedIds = () => boxes.evaluateAll((els) => els.filter((el) => (el as HTMLInputElement).checked).length);
      await expect.poll(checkedIds).toBe(1);
      const count = await boxes.count();
      for (let i = 0; i < count && (await checkedIds()) < 3; i++) {
        if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
      }
      await expect(page.getByTestId("valgte-antal")).toHaveText("3 af 3 mulige klinikker valgt");

      await page.getByRole("link", { name: "Kontakt klinikkerne" }).click();
      await expect(page.getByTestId("valgt-klinik")).toHaveCount(3);
      // Kontoen findes, og samtykket er givet: ingen kontoformular og ingen samtykkeboks, kun Send
      await expect(page.getByRole("button", { name: "Opret konto og gem samtalen" })).toHaveCount(0);
      await expect(page.getByTestId("samtykke-health_data_sharing")).toHaveCount(0);
      await page.getByRole("button", { name: "Send til 3 klinikker" }).click();
      await expect(page.getByTestId("afsendt")).toContainText("Din sag er sendt");

      await page.goto(`/patient/sag/${caseId}`);
      await expect(page.getByTestId("lead")).toHaveCount(3);
      await expect(page.getByText("Afventer svar")).toHaveCount(3);

      // Fra en kontaktet klinikkes profil kan den ikke vælges igen
      await page.goto(`/klinikker/${clinics[0].id}?sag=${caseId}&${directoryParams}`);
      const leadsResp = (await (await page.request.get(`/api/cases/${caseId}/leads`)).json()) as { leads: { clinic: { id: string } }[] };
      const contacted = leadsResp.leads[0].clinic.id;
      await page.goto(`/klinikker/${contacted}?sag=${caseId}&${directoryParams}`);
      await expect(page.getByText("Du har allerede kontaktet klinikken")).toBeVisible();
      await expect(page.getByRole("button", { name: "Vælg klinik", exact: true })).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    } finally {
      await deleteAccount(page);
      await page.context().close();
    }
  });

  test("patient B kan ikke se eller ændre patient A's sag og leads", async ({ browser }, testInfo) => {
    const a = await newPatientPage(browser, testInfo);
    const b = await newPatientPage(browser, testInfo);
    try {
      const caseA = await signedUpPatientWithCase(a);
      const clinics = await contactableClinics(a);
      const sent = await a.request.post(`/api/cases/${caseA}/leads`, { data: { clinicIds: clinics.slice(0, 2).map((c) => c.id) } });
      expect(sent.status(), await sent.text()).toBe(201);
      const leadId = ((await sent.json()) as { leads: { id: string }[] }).leads[0].id;

      await signedUpPatientWithCase(b, false);

      // UI: A's sag giver "ikke fundet" hos B, uden klinikker eller leads
      await b.goto(`/patient/sag/${caseA}`);
      await expect(b.getByRole("alert")).toBeVisible();
      await expect(b.getByTestId("lead")).toHaveCount(0);
      for (const c of clinics.slice(0, 2)) await expect(b.getByText(c.name)).toHaveCount(0);
      await expect(b.getByRole("link", { name: "Til mine sager" })).toBeVisible();
      await b.screenshot({ path: `test-results/leads-fremmed-sag-${b.viewportSize()!.width}.png` });
      await expectNoHorizontalScroll(b);

      // UI: B's "Mine sager" nævner ikke A's sag, og A's afsendelsesside kan ikke sende noget
      await b.goto("/patient");
      await expect(b.getByRole("heading", { level: 1, name: "Mine sager" })).toBeVisible();
      await expect(b.getByTestId("sag")).toHaveCount(1); // kun B's egen (tomme) sag
      await expect(b.getByTestId("sag").getByText("Afventer svar")).toHaveCount(0);
      await b.goto(`/start/${caseA}/send?klinikker=${clinics[2].id}`);
      await expect(b.getByRole("button", { name: /^Send til/ })).toHaveCount(0);

      // API: B får 404 på læsning, afsendelse og tilbagetrækning, og A's lead er urørt
      expect((await b.request.get(`/api/cases/${caseA}/leads`)).status()).toBe(404);
      expect((await b.request.post(`/api/cases/${caseA}/leads`, { data: { clinicIds: [clinics[2].id] } })).status()).toBe(404);
      expect((await b.request.post(`/api/leads/${leadId}/withdraw`, { data: {} })).status()).toBe(404);
      const after = (await (await a.request.get(`/api/cases/${caseA}/leads`)).json()) as { leads: { status: string }[] };
      expect(after.leads).toHaveLength(2);
      expect(after.leads.every((l) => l.status === "sent")).toBeTruthy();
    } finally {
      await deleteAccount(a);
      await deleteAccount(b);
      await a.context().close();
      await b.context().close();
    }
  });
});
