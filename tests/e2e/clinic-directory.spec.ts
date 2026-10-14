import { expect, test, type Page } from "@playwright/test";

// Patientens vej gennem klinikoversigten (arbejdsplan 2.5, 2.6): oversigt, filter, kort, profil. Forudsætter demodata
// (`npm run seed:demo`) med både verificerede og importerede klinikker. Kører i begge viewports (390 og 1280 px).

type ApiClinic = { id: string; name: string; tier: "basic" | "full"; website: string | null };

const HORIZONTAL_SCROLL = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

async function acceptTermsIfAsked(page: Page) {
  if (/\/vilkaar\/accepter/.test(page.url())) {
    await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
  }
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await acceptTermsIfAsked(page);
  if (!page.url().endsWith(path)) await page.goto(path);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(HORIZONTAL_SCROLL)).toBeLessThanOrEqual(0);
}

// Samler CSP-brud (både konsolfejl og securitypolicyviolation-hændelser).
function watchCsp(page: Page): () => string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /content security policy|violates the following/i.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  void page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Content Security Policy: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return () => problems;
}

// På mobil skal man skifte til kortet; på desktop står det ved siden af listen.
async function showMap(page: Page) {
  const toggle = page.getByRole("button", { name: "Kort", exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
}

test.describe("klinikoversigt og profil", () => {
  test("oversigt, filter, kort og profil", async ({ page }) => {
    const csp = watchCsp(page);
    await visit(page, "/klinikker");
    await expect(page.getByRole("heading", { level: 1, name: "Find en klinik" })).toBeVisible();

    // Klinikkort og kriterier er synlige. Sorteringen kan ændres.
    const cards = page.getByRole("list").locator("> li").filter({ has: page.getByRole("heading", { level: 3 }) });
    await expect(cards.first()).toBeVisible();
    await expect(page.getByTestId("kriterier")).toBeVisible();
    await expect(page.getByLabel("Sortér efter")).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Filter: kun klinikker, der kan kontaktes (verificerede). Listen og kortet viser de samme klinikker.
    const filters = page.getByRole("form", { name: "Filtre" });
    const toggleFilters = page.getByRole("button", { name: "Vis filtre" });
    if (await toggleFilters.isVisible()) await toggleFilters.click();
    const before = await cards.count();
    await filters.getByLabel("Kun klinikker, der kan kontaktes").check();
    await expect(page.getByTestId("kriterier")).toContainText(/kontaktes|verificerede/i);
    await expect.poll(async () => cards.count()).toBeLessThan(before);
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    await expect(cards.filter({ hasText: "Verificeret klinik" })).toHaveCount(count);
    await expectNoHorizontalScroll(page);

    // Kortet: samme antal markører som kort i listen, kreditering synlig, ingen CSP-brud.
    await showMap(page);
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(count);
    await expect(page.locator(".leaflet-control-attribution")).toContainText("© OpenStreetMap-bidragydere");
    await expect(page.locator("img.leaflet-tile").first()).toBeAttached();
    await expectNoHorizontalScroll(page);

    // Klik på en markør viser nøgleoplysninger og et link til profilen.
    await page.locator(".leaflet-marker-icon").first().click();
    const popup = page.locator(".leaflet-popup");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("Verificeret klinik");
    await popup.getByRole("link", { name: "Se profil" }).click();

    // Profilen (fuldt niveau).
    await expect(page).toHaveURL(/\/klinikker\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prisliste" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Åbningstider" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tandlæger" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anmeldelser på TandMatch" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trustpilot (ekstern kilde)" })).toBeVisible();
    await expect(page.getByText("ifølge klinikkens prisliste").first()).toBeVisible();
    // Egne anmeldelser er markeret som verificerede og vises adskilt fra Trustpilot.
    await expect(page.getByText("Verificeret besøg").first()).toBeVisible();
    await expect(page.getByText("Prisnøjagtighed").first()).toBeVisible();
    await expect(page.getByText("Noget gik galt")).toHaveCount(0);
    await expect(page.locator(".leaflet-control-attribution")).toContainText("© OpenStreetMap-bidragydere");
    await expectNoHorizontalScroll(page);

    expect(csp()).toEqual([]);
  });

  test("akut fra forsiden aktiverer akutfilteret", async ({ page }) => {
    const csp = watchCsp(page);
    await visit(page, "/klinikker?akut=1");
    const toggleFilters = page.getByRole("button", { name: "Vis filtre" });
    if (await toggleFilters.isVisible()) await toggleFilters.click();
    await expect(page.getByRole("checkbox", { name: /^Akut Kun klinikker/ })).toBeChecked();
    await expect(page.getByLabel("Sortér efter")).toHaveValue("first_available");
    await expect(page.getByTestId("kriterier")).toContainText(/akut/i);
    await expectNoHorizontalScroll(page);
    expect(csp()).toEqual([]);
  });

  test("basisprofil, websitelink og 404", async ({ page }) => {
    await visit(page, "/klinikker");
    const response = await page.request.get("/api/clinics");
    expect(response.ok()).toBe(true);
    const { clinics } = (await response.json()) as { clinics: ApiClinic[] };
    const basic = clinics.find((clinic) => clinic.tier === "basic" && clinic.website);
    expect(basic, "Kør npm run seed:demo: der mangler importerede klinikker med website").toBeTruthy();

    await visit(page, `/klinikker/${basic!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: basic!.name })).toBeVisible();
    await expect(page.getByText("Klinikken er endnu ikke på TandMatch").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prisliste" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Åbningstider" })).toBeVisible();
    const site = page.locator("header a[target=_blank]").first();
    await expect(site).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    await expectNoHorizontalScroll(page);

    // Ukendt klinik (samme svar som oprettede og slettede): 404-siden.
    await visit(page, "/klinikker/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText(/findes ikke|kunne ikke finde/i).first()).toBeVisible();
  });
});
