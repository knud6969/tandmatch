import { expect, test } from "@playwright/test";
import { cleanup, expectNoHorizontalScroll, patientWithCase, verifiedClinic } from "./helpers/inbox";

// Fanerne på mobil (arbejdsplan 7.8, architecture 6.3): den aktive fane er synlig uden manuel rulning, og fade vises i
// venstre kant, når listen er rullet. Kører i 390 og 1280 px.

test.describe("områdefaner", () => {
  test.setTimeout(120_000);

  test("klinikkens aktive fane er synlig uden manuel rulning", async ({ browser }, testInfo) => {
    const clinic = await verifiedClinic(browser, testInfo, "faner");
    const page = clinic.page;
    const width = page.viewportSize()!.width;
    try {
      await page.goto("/klinik/tandlaeger");
      const nav = page.getByRole("navigation", { name: "Områdenavigation" });
      const tab = nav.getByRole("link", { name: "Tandlæger", exact: true });
      await expect(tab).toHaveAttribute("aria-current", "page");
      await expect(tab).toBeInViewport({ ratio: 1 });
      await expectNoHorizontalScroll(page);
      if (width < 1024) {
        await expect(page.getByTestId("faner-fade-venstre")).toBeVisible();
      }
      await page.screenshot({ path: `test-results/faner-klinik-${width}.png`, clip: { x: 0, y: 0, width, height: 220 } });

      // Skift til en fane i den modsatte ende: også den rulles ind.
      await nav.getByRole("link", { name: "Henvendelser", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/klinik");
      const first = nav.getByRole("link", { name: "Henvendelser", exact: true });
      await expect(first).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId("faner-fade-venstre")).toBeHidden();
      await expectNoHorizontalScroll(page);
    } finally {
      await cleanup(null, [clinic]);
    }
  });

  test("patientens aktive fane er synlig", async ({ browser }, testInfo) => {
    const patient = await patientWithCase(browser, testInfo);
    const page = patient.page;
    const width = page.viewportSize()!.width;
    try {
      await page.goto("/patient/konto");
      const tab = page.getByRole("navigation", { name: "Områdenavigation" }).getByRole("link", { name: "Konto", exact: true });
      await expect(tab).toBeInViewport({ ratio: 1 });
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/faner-patient-${width}.png`, clip: { x: 0, y: 0, width, height: 220 } });
    } finally {
      await cleanup(patient, []);
    }
  });
});
