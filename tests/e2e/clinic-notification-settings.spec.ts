import { expect, test } from "@playwright/test";
import { cleanup, expectNoHorizontalScroll, verifiedClinic } from "./helpers/inbox";

// Sektionen "Notifikationer" på /klinik/profil (clinics 6.3, 11.7), ved 390 og 1280 px. Valgene gemmes og vises igen;
// knappen til browserens notifikationer er der, men trykkes ikke (tilladelsen kræver en rigtig browser og push-tjeneste).
test.describe("klinikkens notifikationer på profilen", () => {
  test.setTimeout(120_000);

  test("valgene gemmes og vises igen, og browserknappen er der", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "notif");
    try {
      const page = x.page;
      await page.goto("/klinik/profil#notifikationer");
      const section = page.locator("#notifikationer");
      await expect(section.getByRole("heading", { name: "Notifikationer", level: 2 })).toBeVisible();
      await expect(section.getByRole("button", { name: "Slå notifikationer til i denne browser" })).toBeVisible();

      // Browser-valgene er låst, til browseren har givet tilladelse.
      const browserBox = section.getByRole("checkbox", { name: "Ny henvendelse" }).nth(1);
      await expect(browserBox).toBeDisabled();

      // Standard: påmindelsen i e-mailen er til. Slå den og "Ny besked" fra og gem.
      const emailReminder = section.getByRole("checkbox", { name: "Påmindelse dagen før en booket tid" }).first();
      const emailMessage = section.getByRole("checkbox", { name: /Ny besked fra en patient/ }).first();
      await expect(emailReminder).toBeChecked();
      await emailReminder.setChecked(false);
      await emailMessage.setChecked(false);
      const save = section.getByRole("button", { name: "Gem notifikationer" });
      await expect(save).toBeEnabled();
      await save.click();
      await expect(section.getByText(/Gemt kl\./)).toBeVisible();

      await page.reload();
      await expect(section.getByRole("checkbox", { name: "Påmindelse dagen før en booket tid" }).first()).not.toBeChecked();
      await expect(section.getByRole("checkbox", { name: /Ny besked fra en patient/ }).first()).not.toBeChecked();
      await expect(section.getByRole("checkbox", { name: "Ny henvendelse" }).first()).toBeChecked();
      expect((await page.request.get("/api/clinics/me/notification-settings")).status()).toBe(200);

      await expectNoHorizontalScroll(page);
      await section.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/notifikationer-${page.viewportSize()!.width}.png`, fullPage: true });
    } finally {
      await cleanup(null, [x]);
    }
  });

  test("service workeren leveres uden vilkårs-gate", async ({ request }) => {
    const response = await request.get("/sw.js", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/javascript/);
    expect(await response.text()).toContain("notificationclick");
  });
});
