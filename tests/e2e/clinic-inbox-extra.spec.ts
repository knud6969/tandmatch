import { expect, test, type Page } from "@playwright/test";
import { cleanup, expectNoHorizontalScroll, verifiedClinic } from "./helpers/inbox";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/${name}-${page.viewportSize()!.width}.png`, fullPage: true });
}

test.describe("klinikkens indbakke: supplerende dækning (5.4)", () => {
  test.setTimeout(120_000);

  test("ukendt eller ugyldigt lead-id giver en pæn fejl uden indhold", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    try {
      for (const id of ["00000000-0000-4000-8000-000000000000", "ikke-et-id"]) {
        const response = await x.page.goto(`/klinik/lead/${id}`);
        expect(response?.status()).toBeLessThan(500);
        await expect(x.page.getByRole("alert")).toBeVisible();
        const text = await x.page.locator("main").innerText();
        expect(text).not.toMatch(/undefined|null|Error|stack|uuid|invalid input/i);
        await expect(x.page.getByRole("button", { name: "Accepter", exact: true })).toHaveCount(0);
        // Vejen tilbage: tilbagelinket på mobil, listen ved siden af fra lg.
        if (x.page.viewportSize()!.width < 1024) {
          await expect(x.page.locator("main").getByRole("link", { name: /Henvendelser/ }).first()).toBeVisible();
        } else {
          await expect(x.page.getByRole("heading", { name: "Henvendelser", level: 2 })).toBeVisible();
        }
        await expectNoHorizontalScroll(x.page);
        await shot(x.page, "lead-ukendt-id");
      }
      expect((await x.page.request.get("/api/leads/ikke-et-id")).status()).toBeLessThan(500);
      expect((await x.page.request.get("/api/leads/00000000-0000-4000-8000-000000000000/messages")).status()).toBeLessThan(500);
      expect((await x.page.request.post("/api/leads/ikke-et-id/decision", { data: { decision: "accept" } })).status()).toBeLessThan(500);
    } finally {
      await cleanup(null, [x]);
    }
  });
});
