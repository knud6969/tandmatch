import { expect, test, type Page } from "@playwright/test";
import { cleanup, verifiedClinic } from "./helpers/inbox";
import { PROFILE_PREVIEW_LABEL } from "../../lib/clinics/constants/clinic-texts";
import { acceptTerms } from "./helpers/terms";

// Patientens vej gennem klinikoversigten (arbejdsplan 2.5, 2.6): oversigt, filter, kort, profil. Demodata
// seedes af tests/e2e/run.sh (`npm run seed:demo`) med både verificerede og importerede klinikker. Kører i begge viewports (390 og 1280 px).

type ApiClinic = { id: string; name: string; tier: "basic" | "full"; website: string | null };

const HORIZONTAL_SCROLL = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

async function acceptTermsIfAsked(page: Page) {
  if (/\/vilkaar\/accepter/.test(page.url())) {
    await acceptTerms(page);
    await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
  }
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await acceptTermsIfAsked(page);
  if (!page.url().endsWith(path)) await page.goto(path);
}

// Vejvisning under "Placering" (clinics 6.3): Google Maps og Apple Maps i ny fane, med klinikkens koordinater.
async function expectDirectionsLinks(scope: ReturnType<Page["locator"]>, name: string) {
  const google = scope.getByRole("link", { name: /Vejvisning i Google Maps/ });
  const apple = scope.getByRole("link", { name: /Vejvisning i Apple Maps/ });
  await expect(google).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
  await expect(apple).toHaveAttribute("href", new RegExp(`^https://maps\\.apple\\.com/\\?daddr=-?\\d+(\\.\\d+)?,-?\\d+(\\.\\d+)?&dirflg=d&q=${encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  for (const link of [google, apple]) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  // Begge links peger på samme punkt.
  const googlePoint = new URL((await google.getAttribute("href"))!).searchParams.get("destination");
  const applePoint = new URL((await apple.getAttribute("href"))!).searchParams.get("daddr");
  expect(googlePoint).toBe(applePoint);
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

    // Klik på en markør viser nøgleoplysninger og et link til profilen, og markøren bliver valgt (større, som i appen).
    const marker = page.locator(".leaflet-marker-icon").first();
    const title = (await marker.getAttribute("title"))!;
    const sizeBefore = (await marker.boundingBox())!.width;
    await marker.click();
    const popup = page.locator(".leaflet-popup");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("Verificeret klinik");
    // Leaflet udskifter ikonet, så markøren findes igen på titlen.
    const selected = page.locator(`.leaflet-marker-icon[title="${title.replace(/"/g, '\\"')}"]`);
    await expect.poll(async () => (await selected.boundingBox())?.width ?? 0).toBeGreaterThan(sizeBefore);
    await popup.getByRole("link", { name: "Se profil" }).click();

    // Profilen (fuldt niveau).
    await expect(page).toHaveURL(/\/klinikker\/[0-9a-f-]{36}(\?.*)?$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prisliste" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Åbningstider" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tandlæger" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anmeldelser på TandMatch" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trustpilot (ekstern kilde)" })).toBeVisible();
    await expect(page.getByText("ifølge klinikkens prisliste").first()).toBeVisible();
    await expect(page.getByText("Noget gik galt")).toHaveCount(0);
    await expect(page.locator(".leaflet-control-attribution")).toContainText("© OpenStreetMap-bidragydere");
    const placering = page.locator("section[aria-labelledby='placering']");
    await expectDirectionsLinks(placering, (await page.getByRole("heading", { level: 1 }).textContent())!.trim());
    await expectNoHorizontalScroll(page);

    // Egne anmeldelser er markeret som verificerede og vises adskilt fra Trustpilot. Markøren ovenfor kan høre til en
    // klinik uden anmeldelser (demodata: v0, v4 og v5 har dem), så vi åbner Nørrebro-klinikken, som altid har tre.
    await visit(page, "/klinikker");
    await cards.filter({ hasText: "Demo Tandklinik Nørrebro" }).first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/klinikker\/[0-9a-f-]{36}(\?.*)?$/);
    await expect(page.getByText("Verificeret besøg").first()).toBeVisible();
    await expect(page.getByText("Prisnøjagtighed").first()).toBeVisible();

    expect(csp()).toEqual([]);
  });

  test("filtre og sortering overlever genindlæsning og tilbage fra profilen", async ({ page }) => {
    await visit(page, "/klinikker");
    const toggleFilters = page.getByRole("button", { name: "Vis filtre" });
    const openFilters = async () => {
      await expect(page.getByRole("form", { name: "Filtre" })).toBeVisible();
      if (await toggleFilters.isVisible()) await toggleFilters.click();
    };
    await openFilters();
    await page.getByRole("form", { name: "Filtre" }).getByLabel("Kun klinikker, der kan kontaktes").check();
    await page.getByLabel("Sortér efter").selectOption("rating");
    await expect(page).toHaveURL(/contactableOnly=true/);
    await expect(page).toHaveURL(/sort=rating/);

    // Genindlæsning bevarer valgene.
    await page.reload();
    await openFilters();
    await expect(page.getByLabel("Kun klinikker, der kan kontaktes")).toBeChecked();
    await expect(page.getByLabel("Sortér efter")).toHaveValue("rating");

    // Profil og tilbage bevarer dem også.
    const cards = page.getByRole("list").locator("> li").filter({ has: page.getByRole("heading", { level: 3 }) });
    await expect(cards.first()).toBeVisible();
    await cards.first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/klinikker\/[0-9a-f-]{36}(\?.*)?$/);
    // Tilbagelinket på profilen bevarer oversigtens filtre.
    await expect(page.getByRole("link", { name: "← Alle klinikker" })).toHaveAttribute("href", /sort=rating/);
    await page.goBack();
    await openFilters();
    await expect(page.getByLabel("Kun klinikker, der kan kontaktes")).toBeChecked();
    await expect(page.getByLabel("Sortér efter")).toHaveValue("rating");
  });

  test("Brug min position står aldrig i adressen, men postnummer gør", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 55.6761, longitude: 12.5683 });
    await visit(page, "/klinikker");
    await expect(page.getByRole("form", { name: "Filtre" })).toBeVisible();
    const toggleFilters = page.getByRole("button", { name: "Vis filtre" });
    if (await toggleFilters.isVisible()) await toggleFilters.click();
    await page.getByRole("button", { name: "Brug min position" }).click();
    await expect(page.getByText("Din position bruges til afstanden")).toBeVisible();
    await page.getByLabel("Sortér efter").selectOption("rating");
    await expect(page).toHaveURL(/sort=rating/);
    expect(page.url()).not.toMatch(/lat=|lng=/);
    // Positionen bruges alligevel i forespørgslen til API'et, så afstand kan sorteres.
    await page.getByLabel("Sortér efter").selectOption("distance");
    await expect(page.getByTestId("kriterier")).toContainText(/Nærmeste først/);
    expect(page.url()).not.toMatch(/lat=|lng=|sort=distance/);

    // Lat/lng i en delt adresse ignoreres, mens postnummer bevares.
    await visit(page, "/klinikker?lat=55.6&lng=12.5&postalCode=2100");
    await expect(page.getByLabel("Sortér efter")).toBeVisible();
    await expect(page).toHaveURL(/postalCode=2100/);
    await expect(page).not.toHaveURL(/lat=|lng=/);
  });

  test("sortering ændrer rækkefølgen og kriterierne", async ({ page }) => {
    await visit(page, "/klinikker?contactableOnly=true");
    const names = page.getByRole("heading", { level: 3 });
    await expect(names.first()).toBeVisible();
    await page.getByLabel("Sortér efter").selectOption("rating");
    await expect(page.getByTestId("kriterier")).toContainText(/stjerner|bedømmelse/i);
    const response = await page.request.get("/api/clinics?contactableOnly=true&sort=rating");
    const { clinics } = (await response.json()) as { clinics: ApiClinic[] };
    await expect(names.first()).toHaveText(clinics[0].name);
    await page.getByLabel("Sortér efter").selectOption("first_available");
    await expect(page).toHaveURL(/sort=first_available/);
    const second = await page.request.get("/api/clinics?contactableOnly=true&sort=first_available");
    const ordered = ((await second.json()) as { clinics: ApiClinic[] }).clinics;
    await expect(names.first()).toHaveText(ordered[0].name);
  });

  test("akut fra forsiden aktiverer akutfilteret", async ({ page }) => {
    const csp = watchCsp(page);
    await visit(page, "/klinikker?akut=1");
    await expect(page.getByRole("form", { name: "Filtre" })).toBeVisible();
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

// Klinikkens forhåndsvisning af sin profil (features/clinics 6.5): samme sektioner og rækkefølge som appens klinikprofil,
// også for en registered klinik, og kun for ejeren.
test.describe("forhåndsvisning af klinikkens profil", () => {
  const APP_ORDER = ["Om klinikken", "Placering", "Åbningstider", "Prisliste", "Anmeldelser på TandMatch", "Trustpilot (ekstern kilde)"];

  test("en registered klinik ser sin profil som i appen; andre kan ikke se den", async ({ browser }, testInfo) => {
    const own = await verifiedClinic(browser, testInfo, "forhaand", false);
    const other = await verifiedClinic(browser, testInfo, "forhaand-anden");
    try {
      const patch = await own.page.request.patch("/api/clinics/me", { data: { description: "Vi er en fiktiv testklinik." } });
      expect(patch.ok(), await patch.text()).toBeTruthy();

      await visit(own.page, "/klinik/profil");
      await own.page.getByRole("link", { name: "Se din profil som patienten ser den" }).click();
      await own.page.waitForURL((url) => url.pathname === "/klinik/profil/forhaandsvisning");
      await expect(own.page.getByText(PROFILE_PREVIEW_LABEL)).toBeVisible();
      await expect(own.page.getByText(/ikke offentlig endnu/)).toBeVisible();

      const preview = own.page.getByTestId("profil-forhaandsvisning");
      await expect(preview.getByRole("heading", { level: 1, name: own.name })).toBeVisible();
      await expect(preview.getByText("Vi er en fiktiv testklinik.")).toBeVisible();
      await expect(preview.getByRole("heading", { name: "Trustpilot (ekstern kilde)" })).toBeVisible();
      // Samme rækkefølge som appen (Placering kun med en kendt placering), og intet appen ikke viser.
      const headings = await preview.getByRole("heading", { level: 2 }).allTextContents();
      expect(headings).toEqual(APP_ORDER.filter((h) => h !== "Placering" || headings.includes("Placering")));
      // Placeringen (postnummerets midtpunkt; "Testvej" findes ikke i det falske adresseopslag) har vejvisning.
      if (headings.includes("Placering")) await expectDirectionsLinks(preview.locator("section[aria-labelledby='placering']"), own.name);
      await expect(preview.getByRole("heading", { name: "Tandlæger" })).toHaveCount(0);
      await expect(preview.getByRole("heading", { name: "Ledige tider" })).toHaveCount(0);
      if ((own.page.viewportSize()?.width ?? 1280) <= 390) await expectNoHorizontalScroll(own.page);

      // En anden klinik ser kun sin egen forhåndsvisning og får 404 på den uverificerede profil.
      expect((await other.page.request.get(`/api/clinics/${own.id}`)).status()).toBe(404);
      await visit(other.page, "/klinik/profil/forhaandsvisning");
      await expect(other.page.getByTestId("profil-forhaandsvisning").getByRole("heading", { level: 1, name: other.name })).toBeVisible();
      await expect(other.page.getByText(own.name)).toHaveCount(0);

      // Uden login sendes man væk fra siden.
      const anon = await browser.newPage({ baseURL: testInfo.project.use.baseURL });
      await anon.goto("/klinik/profil/forhaandsvisning");
      expect(new URL(anon.url()).pathname).not.toBe("/klinik/profil/forhaandsvisning");
      await anon.close();
    } finally {
      await cleanup(null, [own, other]);
    }
  });
});
