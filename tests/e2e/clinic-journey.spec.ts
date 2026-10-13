import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

// Klinikrejsen (arbejdsplan 1.8): opret klinik, profil, prisliste, åbningstider, blokeret tid, tandlæge med portræt og
// porteføljebillede, og sletning af kontoen. Kun fiktive data og genererede pladsholderbilleder.

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Genererer en ensfarvet PNG (pladsholder, ikke et rigtigt foto).
function placeholderPng(size = 64, rgb: [number, number, number] = [120, 160, 220]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function uniqueCvr(): string {
  // Fiktivt 8-cifret nummer, unikt pr. kørsel.
  return String(Date.now() % 100000000).padStart(8, "0");
}

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
  await expect(page.locator("h1").first()).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horisontal scroll på ${label}`).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

test("klinikrejsen: opret, sæt op, tilføj tandlæge og slet kontoen", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const mobile = testInfo.project.name === "mobil";
  const cvr = uniqueCvr();
  const email = `e2e-klinik-${testInfo.project.name}-${Date.now()}@example.com`;
  const clinicName = `E2E Testklinik ${testInfo.project.name} ${cvr}`;
  let deleted = false;

  try {
    // 1. Opret klinik
    await visit(page, "/opret/klinik");
    await page.getByLabel("Klinikkens navn").fill(clinicName);
    await page.getByLabel("CVR-nummer").fill(cvr);
    await page.getByLabel("Adresse").fill("Testvej 1");
    await page.getByLabel("Postnummer").fill("2000");
    await page.getByLabel("By", { exact: true }).fill("Frederiksberg");
    await page.getByLabel("Telefon").fill("12345678");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Adgangskode").fill("Test-kodeord-1234");
    if (mobile) await expectNoHorizontalScroll(page, "/opret/klinik");
    await page.getByRole("button", { name: "Opret klinik" }).click();
    await page.waitForURL((url) => url.pathname === "/klinik");
    await expect(page.locator("h1").first()).toBeVisible();
    if (mobile) await expectNoHorizontalScroll(page, "/klinik");

    // 2. Profil
    await visit(page, "/klinik/profil");
    await expect(page.getByLabel("CVR-nummer")).toHaveValue(cvr);
    await page.getByLabel("Beskrivelse").fill("Fiktiv testklinik til automatiske tests.");
    await page.getByLabel("Hjemmeside").fill("https://example.com");
    if (mobile) await expectNoHorizontalScroll(page, "/klinik/profil");
    await page.getByRole("button", { name: "Gem profil" }).click();
    await expect(page.getByText(/Gemt kl\./).first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Beskrivelse")).toHaveValue("Fiktiv testklinik til automatiske tests.");

    // 3. Prisliste
    await visit(page, "/klinik/prisliste");
    const firstService = page.locator("ul input[type=checkbox]").first();
    await firstService.check();
    await page.getByLabel("Pris fra (kr.)").first().fill("500");
    await page.getByLabel("Pris til (kr.)").first().fill("900");
    await page.getByLabel("Varighed (min.)").first().fill("30");
    if (mobile) await expectNoHorizontalScroll(page, "/klinik/prisliste");
    await page.getByRole("button", { name: /Gem prisliste \(1 ydelse\)/ }).click();
    await expect(page.getByText(/Gemt kl\./).first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Pris fra (kr.)").first()).toHaveValue("500");
    await expect(page.getByLabel("Pris til (kr.)").first()).toHaveValue("900");

    // 4. Åbningstider med akutvindue og blokeret tid
    await visit(page, "/klinik/aabningstider");
    await page.getByRole("button", { name: /^Hverdage/ }).click();
    await page.getByLabel("Mandag: Akutvindue").first().check();
    if (mobile) await expectNoHorizontalScroll(page, "/klinik/aabningstider");
    await page.getByRole("button", { name: "Gem åbningstider" }).click();
    await expect(page.getByText(/Gemt kl\./).first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Mandag: Akutvindue").first()).toBeChecked();

    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`;
    await page.getByLabel("Fra", { exact: true }).fill(`${day}T10:00`);
    await page.getByLabel("Til", { exact: true }).fill(`${day}T12:00`);
    await page.getByLabel(/Note/).fill("E2E blokering");
    await page.getByRole("button", { name: "Blokér tid" }).click();
    await expect(page.getByText("Tiden er blokeret og gemt.")).toBeVisible();
    await expect(page.getByText("E2E blokering")).toBeVisible();
    await page.reload();
    await expect(page.getByText("E2E blokering")).toBeVisible();
    if (mobile) await expectNoHorizontalScroll(page, "/klinik/aabningstider (blokering)");
    await page.getByRole("button", { name: "Fjern" }).filter({ hasNot: page.locator("span.sr-only") }).last().click();
    await expect(page.getByText("Blokeringen er fjernet.")).toBeVisible();

    // 5. Tandlæge med portræt og porteføljebillede
    await visit(page, "/klinik/tandlaeger");
    await page.getByLabel("Navn").first().fill("Test Tandlæge");
    await page.getByLabel(/^Titel/).first().fill("Tandlæge");
    await page.getByRole("button", { name: "Tilføj tandlæge" }).click();
    await expect(page.getByRole("heading", { name: "Test Tandlæge", exact: true })).toBeVisible();

    await page.getByLabel("Vælg portræt af Test Tandlæge").setInputFiles({
      name: "portraet.png",
      mimeType: "image/png",
      buffer: placeholderPng(64, [200, 150, 120]),
    });
    await expect(page.getByRole("img", { name: "Portræt af Test Tandlæge" })).toBeVisible();

    const upload = page.getByRole("button", { name: "Upload billede" });
    await expect(upload).toBeDisabled();
    await page.getByLabel("Billede (JPEG eller PNG)").setInputFiles({
      name: "portefolje.png",
      mimeType: "image/png",
      buffer: placeholderPng(64, [100, 200, 160]),
    });
    await page.getByLabel(/Billedtekst/).fill("Pladsholder");
    await expect(upload).toBeDisabled(); // billede valgt, men samtykke mangler
    await page.getByRole("checkbox", { name: /samtykke/i }).check();
    await expect(upload).toBeEnabled();
    await upload.click();
    await expect(page.getByText(/Billedet er uploadet/)).toBeVisible();
    await expect(page.getByRole("img", { name: "Pladsholder" })).toBeVisible();
    if (mobile) await expectNoHorizontalScroll(page, "/klinik/tandlaeger");

    // 6. Slet kontoen
    await visit(page, "/klinik/profil");
    await page.getByRole("button", { name: /Slet kontoen/ }).click();
    await page.getByLabel("Skriv SLET for at bekræfte").fill("SLET");
    await page.getByRole("button", { name: "Slet kontoen permanent" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/klinik"));
    deleted = true;
    await page.goto("/klinik");
    await expect(page).toHaveURL(/\/log-ind|\/login/);
  } finally {
    if (!deleted) {
      // Oprydning ved fejl midt i forløbet: slet kontoen via API'et med den aktuelle session.
      await page.request.delete("/api/clinics/me", { data: { confirm: "SLET" } }).catch(() => undefined);
    }
  }
});
