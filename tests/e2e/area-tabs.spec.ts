import { expect, test } from "@playwright/test";
import { cleanup, expectNoHorizontalScroll, verifiedClinic } from "./helpers/inbox";

// Klinikkens fire faner (features/clinics/README.md 6.3, 2026-10-24): Klinikprofil er aktiv på opsætningssiderne, som har en
// lokal undernavigation; den aktive fane er synlig uden rulning; logoet fører til /klinik. Kører i 390 og 1280 px.

test.describe("områdefaner", () => {
  test.setTimeout(120_000);

  test("klinikkens aktive fane er synlig uden manuel rulning", async ({ browser }, testInfo) => {
    const clinic = await verifiedClinic(browser, testInfo, "faner");
    const page = clinic.page;
    const width = page.viewportSize()!.width;
    try {
      await page.goto("/klinik/tandlaeger");
      const nav = page.getByRole("navigation", { name: "Områdenavigation" });
      await expect(nav.getByRole("link")).toHaveText(["Henvendelser", "Kalender", "Anmeldelser", "Klinikprofil"]);
      // ratio 0.99: scrollIntoView runder scrollLeft til hele pixels, så fanen kan mangle en brøkdel af en pixel.
      const tab = nav.getByRole("link", { name: "Klinikprofil", exact: true });
      await expect(tab).toHaveAttribute("aria-current", "page");
      await expect(tab).toBeInViewport({ ratio: 0.99 });
      // Undernavigationen på Klinikprofil.
      const sub = page.getByRole("navigation", { name: "Klinikprofil" });
      await expect(sub.getByRole("link", { name: "Tandlæger" })).toHaveAttribute("aria-current", "page");
      await sub.getByRole("link", { name: "Prisliste" }).click();
      await page.waitForURL((url) => url.pathname === "/klinik/prisliste");
      await expect(tab).toHaveAttribute("aria-current", "page");
      await sub.getByRole("link", { name: "Profil" }).click();
      await page.waitForURL((url) => url.pathname === "/klinik/profil");
      await expect(page.getByTestId("opsaetning")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/faner-klinik-${width}.png`, clip: { x: 0, y: 0, width, height: 220 } });

      // Skift til en fane i den modsatte ende: også den rulles ind.
      await nav.getByRole("link", { name: "Henvendelser", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/klinik");
      const first = nav.getByRole("link", { name: "Henvendelser", exact: true });
      await expect(first).toBeInViewport({ ratio: 0.99 });
      await expect(page.getByTestId("faner-fade-venstre")).toBeHidden();
      await expectNoHorizontalScroll(page);

      // Logoet fører en indlogget klinik til henvendelserne.
      await page.goto("/klinik/kalender");
      await page.getByRole("link", { name: "TandMatch, til henvendelser" }).click();
      await page.waitForURL((url) => url.pathname === "/klinik");
    } finally {
      await cleanup(null, [clinic]);
    }
  });
});
