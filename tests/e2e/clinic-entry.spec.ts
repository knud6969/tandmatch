import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, fakeIp } from "./helpers/inbox";

// Klinikkernes indgang (features/site 6.1, identity 2.5 og 10.2): forside, oprettelse, login og glemt adgangskode, ved
// 390 og 1280 px (projekterne "mobil" og "desktop"). Kun fiktive data. Nulstillingslinket laves med admin.generateLink,
// fordi den lokale Supabase ikke sender e-mails.
const PASSWORD = "test-adgangskode-123";
const NEW_PASSWORD = "nyt-kodeord-4567";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Afviser: Supabase-URL'en er ikke lokal.");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function freshPage(page: Page) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
}

// Opretter en klinik via API'et (med vilkårs-accept) og returnerer e-mail og bruger-id.
async function apiClinic(page: Page): Promise<{ email: string; userId: string }> {
  const email = `e2e-indgang-${randomUUID()}@example.com`;
  expect((await page.request.post("/api/terms/accept", { data: { termsVersion: "v0-prototype", privacyVersion: "v0-prototype" } })).status()).toBe(200);
  const res = await page.request.post("/api/auth/signup", {
    data: {
      role: "clinic",
      email,
      password: PASSWORD,
      cvr: String(10_000_000 + Math.floor(Math.random() * 89_999_999)),
      clinicName: "E2E Indgangsklinik",
      address: "Testvej 1",
      postalCode: "2100",
      city: "København Ø",
      phone: "00 00 00 01",
    },
  });
  expect(res.status()).toBe(201);
  const { userId } = (await res.json()) as { userId: string };
  await page.request.post("/api/auth/logout");
  await page.context().clearCookies();
  return { email, userId };
}

test.describe("klinikkernes indgang", () => {
  test.beforeEach(async ({ page }) => freshPage(page));

  test("forsiden er til klinikker, uden vilkårs-gate og uden indgang til oversigten", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Patienter, der ved, hvad de vil have");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Opret klinik" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Log ind" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Er du patient? Hent appen" })).toBeVisible();
    await expect(page.getByText("Den kommer snart til iPhone.")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Find en klinik" })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Find en klinik" })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    // Headerens "Opret konto" går direkte til klinikformularen; /opret omdirigerer dertil.
    await page.getByRole("banner").getByRole("link", { name: "Opret konto" }).click();
    await expect(page).toHaveURL(/\/opret\/klinik$/);
    await page.goto("/opret");
    await expect(page).toHaveURL(/\/opret\/klinik$/);

    // Oversigten findes stadig, men er bag gaten.
    await page.context().clearCookies();
    await page.goto("/klinikker");
    await expect(page).toHaveURL(/\/vilkaar\/accepter/);
  });

  test("oprettelse kræver vilkårsfeltet og giver ingen ekstra gate-side", async ({ page }) => {
    const email = `e2e-opret-${randomUUID()}@example.com`;
    await page.goto("/opret/klinik");
    await expect(page).toHaveURL(/\/opret\/klinik$/);
    await page.getByLabel("Klinikkens navn").fill("E2E Opretklinik");
    await page.getByLabel("CVR-nummer").fill(String(10_000_000 + Math.floor(Math.random() * 89_999_999)));
    await page.getByLabel("Adresse").fill("Testvej 2");
    await page.getByLabel("Postnummer").fill("2000");
    await page.getByLabel("By", { exact: true }).fill("Frederiksberg");
    await page.getByLabel("Telefon").fill("12345678");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Adgangskode").fill(PASSWORD);
    await expect(page.getByText("anonym patientsamtale")).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: "Opret klinik" }).click();
    await expect(page.getByText("Du skal acceptere vilkårene for at oprette klinikken.")).toBeVisible();
    await expect(page).toHaveURL(/\/opret\/klinik$/);

    await page.getByRole("checkbox", { name: /accepterer brugervilkårene/ }).check();
    await page.getByRole("button", { name: "Opret klinik" }).click();
    await page.waitForURL((url) => url.pathname === "/klinik");
    await expect(page.getByText("Afventer verificering", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kontakt os" })).toHaveAttribute("href", "/kontakt");

    // Kontoen: skift adgangskode med forkert nuværende adgangskode viser en fejl.
    await page.goto("/klinik/profil");
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "Skift adgangskode" }).click();
    await page.getByLabel("Nuværende adgangskode").fill("forkert-kode-1");
    await page.getByLabel("Ny adgangskode", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Gentag ny adgangskode").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Skift adgangskode" }).click();
    await expect(page.getByText("Den nuværende adgangskode er forkert.")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.request.delete("/api/clinics/me", { data: { confirm: "SLET" } });
  });

  test("login er for klinikker, og glemt adgangskode virker hele vejen", async ({ page }) => {
    const { email, userId } = await apiClinic(page);
    try {
      // Fra forsiden (uden gate) via headeren til login (bag gaten) og tilbage efter accept.
      await page.goto("/");
      await page.getByRole("banner").getByRole("link", { name: "Log ind" }).click();
      await page.waitForURL(/\/vilkaar\/accepter/);
      await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
      await page.waitForURL((url) => url.pathname === "/login");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log ind som klinik");
      await expect(page.getByText("Er du patient? Brug TandMatch-appen.")).toBeVisible();
      await expectNoHorizontalScroll(page);

      // Glemt adgangskode: samme kvittering for alle e-mails.
      await page.getByRole("link", { name: "Glemt adgangskode?" }).click();
      await expect(page).toHaveURL(/\/glemt-adgangskode$/);
      await page.getByLabel("E-mail").fill(email);
      await page.getByRole("button", { name: "Send link" }).click();
      await expect(page.getByText(/Hvis der findes en konto med den e-mail/)).toBeVisible();
      await expectNoHorizontalScroll(page);

      // Et ugyldigt link giver en forklaring og en vej videre.
      await page.context().clearCookies();
      await page.goto("/nulstil-adgangskode?token_hash=ugyldig-token-hash&type=recovery");
      await expect(page).toHaveURL(/\/nulstil-adgangskode/);
      await expect(page.getByText(/Linket er ugyldigt, brugt eller udløbet/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Bed om et nyt link" })).toBeVisible();

      // Et gyldigt link (på en ny enhed uden vilkårs-cookie): ny adgangskode og login.
      const { data } = await admin().auth.admin.generateLink({ type: "recovery", email });
      await page.goto(`/nulstil-adgangskode?token_hash=${data.properties!.hashed_token}&type=recovery`);
      await expect(page.getByLabel("Ny adgangskode", { exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/nulstil-adgangskode$/);
      await page.getByLabel("Ny adgangskode", { exact: true }).fill(NEW_PASSWORD);
      await page.getByLabel("Gentag ny adgangskode").fill("noget-andet-123");
      await page.getByRole("button", { name: "Gem ny adgangskode" }).click();
      await expect(page.getByText("De to adgangskoder er ikke ens.")).toBeVisible();
      await page.getByLabel("Gentag ny adgangskode").fill(NEW_PASSWORD);
      await expectNoHorizontalScroll(page);
      await page.getByRole("button", { name: "Gem ny adgangskode" }).click();
      await page.waitForURL((url) => url.pathname.startsWith("/login") || url.pathname.startsWith("/vilkaar"));
      if (page.url().includes("/vilkaar/accepter")) {
        await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
        await page.waitForURL((url) => url.pathname === "/login");
      }
      await expect(page.getByText("Din adgangskode er skiftet. Log ind med den nye.")).toBeVisible();
      await page.getByLabel("E-mail").fill(email);
      await page.getByLabel("Adgangskode").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Log ind" }).click();
      await page.waitForURL((url) => url.pathname === "/klinik");
    } finally {
      await admin().auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });
});
