import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

// Sagsflowet (arbejdsplan 3.4): anonym patient -> chat -> billede efter særskilt samtykke -> bekræft behandlinger ->
// tid og sted -> opsummering godkendt -> "Næste: find klinikker". AI'en er falsk (AI_FAKE_CLIENT=1 i run.sh), og billedet
// er en genereret pladsholder. Kører i begge viewports (390 og 1280 px).

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

async function say(page: Page, text: string, reply: string | RegExp) {
  const input = page.getByLabel("Din besked til AI-assistenten");
  await input.fill(text);
  // Inputfeltet står fast i bunden og er altid inden for skærmen.
  await expect(input).toBeInViewport();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(reply)).toBeVisible();
  await expect(input).toBeInViewport();
  await expectNoHorizontalScroll(page);
}

test.describe("sagsflowet", () => {
  test("anonym: chat, billede efter samtykke, behandlinger, opsummering og sletning", async ({ page }) => {
    const csp = watchCsp(page);
    await page.goto("/start");
    await acceptTermsIfAsked(page);
    await page.goto("/start");
    await expect(page.getByRole("heading", { level: 1, name: "Beskriv dit problem" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Særskilt AI-samtykke, aldrig forudafkrydset.
    const start = page.getByRole("button", { name: "Start samtalen" });
    await expect(start).toBeDisabled();
    await page.getByLabel(/Jeg accepterer, at tekst og chat/).check();
    await start.click();
    await expect(page).toHaveURL(/\/start\/[0-9a-f-]{36}$/);
    const caseUrl = page.url();
    await expect(page.getByTestId("anonym-banner")).toContainText("48 timer");
    await expect(page.getByTestId("anonym-banner")).toContainText(/konto/);
    await expectNoHorizontalScroll(page);

    // Chat: fast tekst om AI'ens grænser, foreløbig vurdering med mærkat, forslag til behandling.
    await expect(page.getByText("AI-assistenten giver ikke endelige vurderinger")).toBeVisible();
    // Fast tekst om personoplysninger står over chatten (M1).
    const pii = page.getByTestId("pii-advarsel");
    await expect(pii).toHaveText("Skriv ikke dit navn, din adresse eller kontaktoplysninger.");
    const chatList = page.getByRole("list", { name: "Samtale med AI-assistenten" });
    expect((await pii.boundingBox())!.y).toBeLessThan((await chatList.boundingBox())!.y);
    await say(page, "Jeg tror jeg har karies", "Kan du beskrive, hvornår det gør ondt?");
    const assessment = page.getByTestId("foreloebig-vurdering");
    await expect(assessment).toContainText("Foreløbig – klinikken vurderer endeligt");
    await say(page, "Jeg vil gerne have hvidere tænder, blegning", /Så kan blegning være relevant/);
    await expect(page.getByTestId("forslag")).toContainText("Blegning");

    // Akut: den faste blok står over inputfeltet og bliver, hvor den er.
    const input = page.getByLabel("Din besked til AI-assistenten");
    await input.fill("Jeg har feber og stærke smerter");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const akut = page.getByTestId("akut-blok");
    await expect(akut).toBeVisible();
    await expect(akut.getByRole("link", { name: "Se klinikker med ledig akuttid" })).toHaveAttribute("href", "/klinikker?akut=1");
    await expect(akut).toContainText("112");
    await expect(akut).toContainText("1813");
    await expect(akut).toBeInViewport();
    await expect(input).toBeInViewport();
    await expectNoHorizontalScroll(page);

    // Billeder: samtykke først, derefter upload.
    await page.getByRole("button", { name: "Fortsæt til billeder" }).click();
    await expect(page.getByLabel(/Vælg billeder/)).toHaveCount(0);
    await expect(page.getByTestId("samtykke-image_upload")).toContainText("fotos af min mund");
    await expectNoHorizontalScroll(page);
    const give = page.getByRole("button", { name: "Giv samtykke og fortsæt" });
    await expect(give).toBeDisabled();
    await page.getByLabel("Jeg giver mit samtykke").check();
    await give.click();
    await page.getByLabel(/Vælg billeder/).setInputFiles({ name: "tand.png", mimeType: "image/png", buffer: placeholderPng() });
    await expect(page.getByTestId("billede")).toHaveCount(1);
    await expectNoHorizontalScroll(page);

    // Behandlinger: AI-forslaget er forvalgt, men patienten bekræfter selv.
    await page.getByRole("button", { name: "Fortsæt til behandlinger" }).click();
    await expect(page.getByRole("heading", { name: "Bekræft behandlinger" })).toBeVisible();
    await expect(page.getByText("Foreslået ud fra din beskrivelse")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Blegning/ })).toBeChecked();
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Bekræft og fortsæt" }).click();

    // Tid og sted.
    await expect(page.getByRole("heading", { name: "Hvornår og hvor?" })).toBeVisible();
    await page.getByLabel("Inden for 2 uger").check();
    await page.getByLabel("Dit postnummer").fill("2100");
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Gem og fortsæt" }).click();

    // Opsummering: udkast, ret, godkend.
    await expect(page.getByRole("heading", { name: "Din opsummering" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Næste: find klinikker" })).toHaveCount(0);
    // Billedbeskrivelser vises pr. billede med mærkat, så patienten godkender dem sammen med opsummeringen.
    const descriptions = page.getByTestId("billedbeskrivelser");
    await expect(descriptions).toBeVisible();
    await expect(descriptions.getByText("Beskrivelse, ikke vurdering")).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Lav udkast til opsummering" }).click();
    const summary = page.getByLabel("Opsummering til klinikkerne");
    await expect(summary).toHaveValue(/Patienten oplyser/);
    await summary.fill("Jeg vil gerne have lysere tænder.");
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Godkend opsummering" }).click();
    const next = page.getByRole("link", { name: "Næste: find klinikker" });
    await expect(next).toBeVisible();
    await expect(next).toHaveAttribute("href", /^\/klinikker\?sag=[0-9a-f-]{36}&services=blegning&postalCode=2100$/);
    await expectNoHorizontalScroll(page);

    // Ingen position i adressen, og filtrene følger med til oversigten.
    await next.click();
    await expect(page).toHaveURL(/\/klinikker\?.*sag=/);
    await expect(page).toHaveURL(/services=blegning/);
    expect(page.url()).not.toMatch(/lat=|lng=/);

    // Slet min samtale: sagen og samtalen slettes, og siden findes ikke længere.
    await page.goto(caseUrl);
    await page.getByRole("button", { name: "Slet min samtale" }).click();
    await page.getByRole("button", { name: "Ja, slet alt" }).click();
    await expect(page).toHaveURL(/\/start$/);
    const gone = await page.request.get(`/api/cases/${caseUrl.split("/").pop()}`);
    expect(gone.status()).toBe(404);

    expect(csp()).toEqual([]);
  });
});
