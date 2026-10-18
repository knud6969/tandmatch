import { expect, test, type Page } from "@playwright/test";
import { cleanup, expectNoHorizontalScroll, patientWithCase, sendTo, verifiedClinic } from "./helpers/inbox";

// Tester 5.5: én lang besked (2000 tegn, også uden mellemrum) må ikke skjule afsenderlinjen, ikke scrolle siden
// og ikke give horisontal scroll hverken hos klinikken eller patienten (390 og 1280 px).

async function senderLineVisible(page: Page, name: string) {
  const item = page.getByTestId("besked").last();
  const sender = item.locator("p").first();
  await expect(sender).toBeVisible();
  const list = page.getByRole("list", { name: "Beskeder" });
  const s = (await sender.boundingBox())!;
  const l = (await list.boundingBox())!;
  const vp = page.viewportSize()!;
  // Afsenderlinjen ligger inde i listens synlige område og på skærmen.
  expect(s.y).toBeGreaterThanOrEqual(l.y - 1);
  expect(s.y + s.height).toBeLessThanOrEqual(l.y + l.height + 1);
  expect(s.x).toBeGreaterThanOrEqual(0);
  expect(s.x + s.width).toBeLessThanOrEqual(vp.width);
  // Selve listen er ikke bredere end skærmen.
  expect(l.x + l.width).toBeLessThanOrEqual(vp.width + 1);
  await page.screenshot({ path: `test-results/lang-besked-${name}-${vp.width}.png`, fullPage: true });
}

test.describe("beskedtråd med én lang besked (5.5)", () => {
  test.setTimeout(150_000);

  for (const [label, body] of [
    ["med-mellemrum", ("Lang besked med mellemrum. ".repeat(80)).slice(0, 2000)],
    ["uden-mellemrum", "x".repeat(2000)],
  ] as const) {
    test(`afsenderlinjen er synlig og der er ingen horisontal scroll (${label})`, async ({ browser }, testInfo) => {
      const x = await verifiedClinic(browser, testInfo, "lang");
      const patient = await patientWithCase(browser, testInfo);
      try {
        const [leadId] = await sendTo(patient, [x]);
        expect((await patient.page.request.post(`/api/leads/${leadId}/messages`, { data: { body } })).ok()).toBeTruthy();

        await x.page.goto(`/klinik/lead/${leadId}`);
        await expect(x.page.getByTestId("besked")).toHaveCount(1);
        await senderLineVisible(x.page, `klinik-${label}`);
        await expectNoHorizontalScroll(x.page);

        await patient.page.goto(`/patient/sag/${patient.caseId}`);
        await patient.page.getByRole("button", { name: /^Beskeder/ }).click();
        await expect(patient.page.getByTestId("besked")).toHaveCount(1);
        await senderLineVisible(patient.page, `patient-${label}`);
        await expectNoHorizontalScroll(patient.page);
      } finally {
        await cleanup(patient, [x]);
      }
    });
  }
});
