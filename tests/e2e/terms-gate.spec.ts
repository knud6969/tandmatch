import { expect, test } from "@playwright/test";

test.describe("vilkårs-gate", () => {
  test("besøgende sendes til accept-siden og kommer tilbage efter accept", async ({ page }) => {
    await page.goto("/klinik/profil");
    await expect(page).toHaveURL(/\/vilkaar\/accepter/);
    await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
    await expect(page).not.toHaveURL(/\/vilkaar\/accepter/);
  });

  test("forsiden har ingen horisontal scroll efter accept", async ({ page }) => {
    await page.goto("/");
    if (/\/vilkaar\/accepter/.test(page.url())) {
      await page.getByRole("button", { name: /Jeg accepterer vilkårene/ }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/vilkaar/accepter"));
    }
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
