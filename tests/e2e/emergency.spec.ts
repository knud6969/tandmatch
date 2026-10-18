import { expect, test, type Page } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../lib/constants/consents";
import { fakeIp } from "./helpers/inbox";

// Akutvejen (arbejdsplan 7.4, architecture 6.1 `/akut`): forside -> "Jeg har ondt" -> klinik og tid -> konto inline -> samtykke
// (v1) -> beskrivelse, navn og telefon -> send og reservér. Klinikkerne og deres akuttider kommer fra demodata (`npm run seed:demo`).
// Kører i 390 og 1280 px.

const HORIZONTAL_SCROLL = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
const PASSWORD = "test-adgangskode-123";

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(HORIZONTAL_SCROLL)).toBeLessThanOrEqual(0);
}

async function acceptTermsIfAsked(page: Page) {
  if (/\/vilkaar\/accepter/.test(page.url())) {
    await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
  }
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${page.viewportSize()!.width}.png`, fullPage: true });

// Vælger den første klinik med akuttid og dens første tid (trin 1).
async function pickFirstSlot(page: Page) {
  await expect(page.getByTestId("akut-klinikliste")).toBeVisible();
  await page.getByRole("button", { name: /^Vælg tid/ }).first().click();
  await expect(page.getByTestId("akut-tider")).toBeVisible();
  await page.getByTestId("tid").first().click();
  await expect(page.getByTestId("akut-valgt")).toBeVisible();
}

async function signUp(page: Page, buttonName: string) {
  const email = `e2e-akut-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.getByLabel("Fornavn").fill("Mette");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(PASSWORD);
  await page.getByRole("button", { name: buttonName }).click();
}

async function giveConsent(page: Page) {
  const gate = page.getByTestId("samtykke-health_data_sharing");
  await expect(gate).toBeVisible();
  // Samtykket vises i gældende version (v1) med ordlyden for klinikker.
  expect(CONSENT_TEXT_VERSIONS.health_data_sharing).toBe("health_data_sharing@v1-klinikker");
  await expect(gate).toContainText("de klinikker, jeg selv vælger at kontakte");
  const give = page.getByRole("button", { name: "Giv samtykke", exact: true });
  await expect(give).toBeDisabled();
  await page.getByLabel("Jeg giver mit samtykke").check();
  await give.click();
  await expect(page.getByTestId("akut-send")).toBeVisible();
}

async function deleteAccount(page: Page) {
  // Leadet og reservationen peger på en demoklinik og ville ellers blokere næste `seed:demo`.
  await page.request.delete("/api/patients/me", { data: { confirm: "SLET" } });
}

// Egen afsender-IP, så kontooprettelserne her ikke bruger den fælles IP-grænse (signup pr. time), som de øvrige tests deler.
test.use({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });

test.describe("akutvejen", () => {
  test("fra forsiden til reserveret tid, med konto oprettet undervejs", async ({ page }) => {
    await page.goto("/");
    await acceptTermsIfAsked(page);
    await page.getByRole("link", { name: "Jeg har ondt" }).click();
    await expect(page).toHaveURL(/\/akut$/);
    await expect(page.getByRole("heading", { level: 1, name: "Jeg har ondt" })).toBeVisible();
    // Fast akut-tekst med 112 og 1813 øverst.
    const notice = page.getByTestId("akut-blok");
    await expect(notice).toContainText("112");
    await expect(notice).toContainText("1813");
    await expectNoHorizontalScroll(page);

    try {
      await pickFirstSlot(page);
      await shot(page, "akut-trin-1-valgt");

      // Trin 2: ingen session, så konto oprettes på siden, og valget bevares.
      await expect(page.getByRole("heading", { name: /Konto og samtykke/ })).toBeVisible();
      await expect(page.getByTestId("akut-valgt")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, "akut-trin-2-konto");
      await signUp(page, "Opret patientkonto");
      await expect(page).toHaveURL(/\/akut$/);
      await expect(page.getByTestId("akut-valgt")).toBeVisible();
      await giveConsent(page);

      // Trin 3: validering først, så afsendelse.
      await page.getByLabel("Fulde navn").fill("Mette Hansen");
      await page.getByLabel("Telefon").fill("1234");
      await page.getByRole("button", { name: "Send og reservér tiden" }).click();
      await expect(page.getByText("Beskriv problemet med mindst 10 tegn.")).toBeVisible();
      await expect(page.getByTestId("akut-sendt")).toHaveCount(0);
      await expect(page.getByTestId("akut-send")).toContainText("Skriv ikke dit cpr-nummer");
      await expect(page.getByTestId("akut-oversigt")).toContainText("ifølge klinikkens prisliste");
      await page.getByLabel("Hvad er der galt?").fill("Jeg har haft kraftig tandpine siden i nat.");
      await page.getByLabel("Telefon").fill("12 34 56 78");
      await expectNoHorizontalScroll(page);
      await shot(page, "akut-trin-3-send");
      await page.getByRole("button", { name: "Send og reservér tiden" }).click();

      const done = page.getByTestId("akut-sendt");
      await expect(done).toContainText("Tiden er reserveret til dig");
      await expect(page.getByTestId("reservation-udloeb")).toContainText(/Reservationen gælder til kl\. \d{2}[.:]\d{2}/);
      await expect(done).toContainText("endelige vurdering");
      await expectNoHorizontalScroll(page);
      await shot(page, "akut-sendt");
      const link = page.getByRole("link", { name: "Se din sag" });
      await expect(link).toHaveAttribute("href", /\/patient\/sag\/[0-9a-f-]{36}$/);
      await link.click();
      await expect(page).toHaveURL(/\/patient\/sag\//);
      await expect(page.getByText(/reserveret|Reserveret/).first()).toBeVisible();
    } finally {
      await deleteAccount(page);
    }
  });

  test("en anonym chat-session konverteres i stedet for at oprette en ny konto", async ({ page }) => {
    await page.goto("/klinikker");
    await acceptTermsIfAsked(page);
    const session = await page.request.post("/api/session/anonymous", {
      data: { aiConsent: { textVersion: CONSENT_TEXT_VERSIONS.ai_processing } },
    });
    expect(session.ok()).toBeTruthy();
    const before = (await (await page.request.get("/api/me")).json()) as { id: string; isAnonymous: boolean };
    expect(before.isAnonymous).toBe(true);

    try {
      await page.goto("/akut");
      await pickFirstSlot(page);
      await expect(page.getByText("Din samtale følger med til din nye konto")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await signUp(page, "Opret konto og gem samtalen");
      await giveConsent(page);
      const after = (await (await page.request.get("/api/me")).json()) as { id: string; isAnonymous: boolean };
      expect(after.id).toBe(before.id);
      expect(after.isAnonymous).toBe(false);
    } finally {
      await deleteAccount(page);
    }
  });

  test("optaget tid henter tiderne igen, og beskrivelsen bevares", async ({ page }) => {
    await page.goto("/");
    await acceptTermsIfAsked(page);
    await page.goto("/akut");
    try {
      await pickFirstSlot(page);
      await signUp(page, "Opret patientkonto");
      await giveConsent(page);
      await page.getByLabel("Hvad er der galt?").fill("Jeg har en knækket tand, og den gør ondt.");
      await page.getByLabel("Fulde navn").fill("Mette Hansen");
      await page.getByLabel("Telefon").fill("12 34 56 78");

      await page.route("**/api/emergency-leads", (route) =>
        route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "SLOT_TAKEN", message: "Tiden er optaget." } }) }),
      );
      await page.getByRole("button", { name: "Send og reservér tiden" }).click();

      // Tilbage til tiderne hos samme klinik, med en forklaring.
      await expect(page.getByTestId("akut-besked")).toContainText("optaget");
      await expect(page.getByTestId("akut-tider")).toBeVisible();
      await expect(page.getByTestId("tid").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shot(page, "akut-slot-taken");
      await page.unroute("**/api/emergency-leads");

      await page.getByTestId("tid").first().click();
      await expect(page.getByLabel("Hvad er der galt?")).toHaveValue("Jeg har en knækket tand, og den gør ondt.");
      await expect(page.getByLabel("Fulde navn")).toHaveValue("Mette Hansen");
      await expect(page.getByLabel("Telefon")).toHaveValue("12 34 56 78");
    } finally {
      await deleteAccount(page);
    }
  });

  test("uden klinikker med akuttid henvises til 1813", async ({ page }) => {
    await page.route("**/api/clinics?*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ clinics: [], sort: "first_available", criteria: [] }) }),
    );
    await page.goto("/akut");
    await acceptTermsIfAsked(page);
    const empty = page.getByTestId("ingen-akuttid");
    await expect(empty).toContainText("1813");
    await expect(page.getByRole("link", { name: "Se alle klinikker i oversigten" })).toHaveAttribute("href", "/klinikker?akut=1");
    await expectNoHorizontalScroll(page);
    await shot(page, "akut-tom");
  });
});
