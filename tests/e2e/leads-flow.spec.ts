import { expect, test, type Page } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../lib/constants/consents";

// Sammenligning og afsendelse (arbejdsplan 4.2) og patientens sager (4.3): sag med godkendt opsummering ->
// klinikoversigten med ?sag= -> vælg 3 -> send med konto og samtykke -> sagen viser 3 leads -> et fjerde valg er ikke muligt ->
// træk et lead tilbage -> en ny klinik kan vælges. Sagen forberedes via API'et (chatten har sin egen test i case-flow.spec.ts),
// og klinikkerne kommer fra demodata (`npm run seed:demo`, fire verificerede klinikker). Kører i 390 og 1280 px.

const HORIZONTAL_SCROLL = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(HORIZONTAL_SCROLL)).toBeLessThanOrEqual(0);
}

async function acceptTermsIfAsked(page: Page) {
  if (/\/vilkaar\/accepter/.test(page.url())) {
    await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
  }
}

// Opretter en anonym session med en sag, der er klar til at blive sendt (behandling, tidsrum, postnummer og godkendt opsummering).
async function prepareCase(page: Page): Promise<string> {
  await page.goto("/klinikker");
  await acceptTermsIfAsked(page);
  const session = await page.request.post("/api/session/anonymous", {
    data: { aiConsent: { textVersion: CONSENT_TEXT_VERSIONS.ai_processing } },
  });
  expect(session.ok()).toBeTruthy();
  const { caseId } = (await session.json()) as { caseId: string };
  const catalog = (await (await page.request.get("/api/services")).json()) as {
    groups: { services: { id: string; slug: string }[] }[];
  };
  const service = catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning");
  expect(service).toBeTruthy();
  expect(
    (
      await page.request.put(`/api/cases/${caseId}/services`, {
        data: { services: [{ serviceId: service!.id, suggestedByAi: false }] },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.patch(`/api/cases/${caseId}`, {
        data: { postalCode: "2100", preferredTimeframe: "within_2_weeks" },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.put(`/api/cases/${caseId}/summary`, {
        data: { summaryText: "Jeg vil gerne have lysere tænder." },
      })
    ).ok(),
  ).toBeTruthy();
  return caseId;
}

// Demoklinikkerne ligger spredt over landet, så afstanden udvides, ellers falder de fleste fra.
const directoryUrl = (caseId: string) => `/klinikker?sag=${caseId}&services=blegning&postalCode=2100&maxDistanceKm=500`;

test.describe("sammenligning, afsendelse og patientens sager", () => {
  test("vælg 3, send med konto og samtykke, træk tilbage og vælg en ny", async ({ page }) => {
    const caseId = await prepareCase(page);
    try {
      await runFlow(page, caseId);
    } finally {
      // Leads peger på demoklinikkerne og ville ellers blokere næste `seed:demo`. Sletning af kontoen rydder sagen og leadsene.
      await page.request.delete("/api/patients/me", {
        data: { confirm: "SLET" },
      });
    }
  });
});

async function runFlow(page: Page, caseId: string) {
  await page.goto(directoryUrl(caseId));
  await expect(page.getByRole("heading", { level: 1, name: "Find en klinik" })).toBeVisible();
  await expect(page.getByText("Vælg klinikker til din sag")).toBeVisible();
  const boxes = page.getByRole("checkbox", { name: /Vælg til kontakt/ });
  await expect(boxes.nth(3)).toBeVisible(); // mindst fire verificerede klinikker i demodata
  await expectNoHorizontalScroll(page);

  // Vælg tre. Det fjerde kan ikke vælges i UI'et.
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await expect(page.getByTestId("valgte-antal")).toHaveText("3 af 3 mulige klinikker valgt");
  await page.screenshot({ path: `test-results/leads-oversigt-${page.viewportSize()!.width}.png` });
  await expect(boxes.nth(3)).toBeDisabled();
  await expectNoHorizontalScroll(page);

  // Compare-baren fylder højst én linje chips (vandret scroll) og dækker ikke sidste kort, når man har scrollet til bunden.
  const bar = page.getByRole("region", { name: "Valgte klinikker" });
  expect((await page.getByTestId("valgte-chips").boundingBox())!.height).toBeLessThanOrEqual(60);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const barTop = (await bar.boundingBox())!.y;
  const lastBox = (await page.locator("ul[aria-busy] > li").last().boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barTop + 1);
  const clinicNames = await page
    .getByRole("region", { name: "Valgte klinikker" })
    .getByRole("button")
    .evaluateAll((els) => els.map((el) => el.querySelector("span")?.textContent ?? ""));
  expect(clinicNames).toHaveLength(3);

  // Videre til afsendelsen: oversigt over de tre, og en anonym patient skal oprette konto.
  await page.getByRole("link", { name: "Kontakt klinikkerne" }).click();
  await expect(page).toHaveURL(new RegExp(`/start/${caseId}/send\\?klinikker=`));
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Send din sag til klinikkerne",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("valgt-klinik")).toHaveCount(3);
  for (const name of clinicNames) await expect(page.getByTestId("valgt-klinik").filter({ hasText: name })).toBeVisible();
  await expect(page.getByText("ifølge klinikkens prisliste").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send til/ })).toHaveCount(0);
  await page.screenshot({ path: `test-results/leads-send-${page.viewportSize()!.width}.png`, fullPage: true });
  await expectNoHorizontalScroll(page);

  const email = `e2e-leads-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.getByLabel("Fornavn").fill("Test");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill("test-adgangskode-123");
  await page.getByRole("button", { name: "Opret konto og gem samtalen" }).click();

  // Samtykke til deling, aldrig forudafkrydset. Først derefter kan der sendes.
  const gate = page.getByTestId("samtykke-health_data_sharing");
  await expect(gate).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send til/ })).toHaveCount(0);
  const give = page.getByRole("button", {
    name: "Giv samtykke",
    exact: true,
  });
  await expect(give).toBeDisabled();
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Jeg giver mit samtykke").check();
  await give.click();
  await page.getByRole("button", { name: "Send til 3 klinikker" }).click();
  await expect(page.getByTestId("afsendt")).toContainText("Din sag er sendt");
  await expectNoHorizontalScroll(page);

  // Sagen viser tre leads, og "Kontakt flere klinikker" findes ikke ved tre aktive.
  await page.getByRole("link", { name: "Se din sag" }).click();
  await expect(page).toHaveURL(new RegExp(`/patient/sag/${caseId}$`));
  const leads = page.getByTestId("lead");
  await expect(leads).toHaveCount(3);
  for (const name of clinicNames) await expect(leads.filter({ hasText: name })).toHaveCount(1);
  await expect(page.getByText("Afventer svar")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Kontakt flere klinikker" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Træk tilbage/ })).toHaveCount(3);
  await expectNoHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/leads-sag-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });

  // Mine sager viser sagen med de tre klinikker.
  await page.goto("/patient");
  await expect(page.getByRole("heading", { level: 1, name: "Mine sager" })).toBeVisible();
  await expect(page.getByTestId("sag")).toHaveCount(1);
  await expect(page.getByTestId("sag").getByText("Afventer svar")).toHaveCount(3);
  await expectNoHorizontalScroll(page);

  // Fjerde valg: ingen afkrydsning i UI, og API'et afviser det også.
  await page.goto(directoryUrl(caseId));
  await expect(page.getByText("Du kan ikke kontakte flere klinikker lige nu")).toBeVisible();
  await expect(boxes).toHaveCount(0);
  const list = (await (await page.request.get("/api/clinics?contactableOnly=true")).json()) as { clinics: { id: string; name: string }[] };
  const fourth = list.clinics.find((c) => !clinicNames.includes(c.name));
  expect(fourth).toBeTruthy();
  const rejected = await page.request.post(`/api/cases/${caseId}/leads`, {
    data: { clinicIds: [fourth!.id] },
  });
  expect(rejected.status()).toBe(409);
  expect(((await rejected.json()) as { error: { code: string } }).error.code).toBe("LEAD_LIMIT");

  // Træk et lead tilbage: ny plads, og en ny klinik kan vælges (den tilbagetrukne kan ikke vælges igen).
  await page.goto(`/patient/sag/${caseId}`);
  await page
    .getByRole("button", { name: /^Træk tilbage/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Ja, træk tilbage" }).click();
  await expect(page.getByText("Trukket tilbage", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Træk tilbage/ })).toHaveCount(2);
  const more = page.getByRole("link", { name: "Kontakt flere klinikker" });
  await expect(more).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expect(more).toHaveAttribute("href", `/klinikker?sag=${caseId}&services=blegning&postalCode=2100`);
  await more.click();
  await expect(page).toHaveURL(new RegExp(`/klinikker\\?.*sag=${caseId}`));
  // Standardafstanden (50 km fra 2100) udelukker de fjerne demoklinikker, så den udvides som i resten af testen.
  await page.goto(directoryUrl(caseId));
  await expect(page.getByText("Du har allerede kontaktet klinikken").first()).toBeVisible();
  await expect(boxes).toHaveCount(1);
  await boxes.first().check();
  await expect(page.getByTestId("valgte-antal")).toHaveText("1 af 1 mulige klinikker valgt");
  await expectNoHorizontalScroll(page);
}
