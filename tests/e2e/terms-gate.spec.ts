import { expect, test } from "@playwright/test";
import { acceptTerms } from "./helpers/terms";

test.describe("vilkårs-gate", () => {
  test("besøgende sendes til accept-siden og kommer tilbage efter accept", async ({ page }) => {
    await page.goto("/klinik/profil");
    await expect(page).toHaveURL(/\/vilkaar\/accepter/);
    await acceptTerms(page);
    await expect(page).not.toHaveURL(/\/vilkaar\/accepter/);
  });

  test("klinikkernes indgang er undtaget; resten er bag gaten (identity 2.5)", async ({ page }) => {
    for (const path of ["/", "/opret/klinik", "/glemt-adgangskode", "/nulstil-adgangskode"]) {
      await page.goto(path);
      await expect(page, path).not.toHaveURL(/\/vilkaar\/accepter/);
    }
    for (const path of ["/login", "/klinikker", "/for-klinikker"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/vilkaar\/accepter/);
    }
  });

  test("forsiden har ingen horisontal scroll", async ({ page }) => {
    await page.goto("/");
    if (/\/vilkaar\/accepter/.test(page.url())) {
      await acceptTerms(page);
      await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
    }
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
