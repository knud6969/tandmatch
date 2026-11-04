import { expect, test } from "@playwright/test";
import { cleanup, expectNoHorizontalScroll, patientWithCase, sendTo, verifiedClinic } from "./helpers/inbox";

// Klinikkens statistik på /klinik/statistik (clinics 6.3, 10.18, 11.26), ved 390 og 1280 px. Tallene svarer til API'et, og
// perioden står i URL'en.
test.describe("klinikkens statistik", () => {
  test.setTimeout(120_000);

  test("tallene svarer til API'et, og perioden står i URL'en", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "stat");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);
      const page = x.page;
      expect((await page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "accept" } })).status()).toBe(200);

      await page.goto("/klinik/statistik");
      const nav = page.getByRole("navigation", { name: "Områdenavigation" });
      await expect(nav.getByRole("link", { name: "Statistik", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: "Statistik", level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "30 dage" })).toHaveAttribute("aria-pressed", "true");

      const api = (await (await page.request.get("/api/clinics/me/stats?days=30")).json()) as {
        leads: { total: number; accepted: number };
        acceptRatePct: number;
      };
      expect(api.leads.total).toBe(1);
      await expect(page.getByTestId("statistik-henvendelser-vaerdi")).toHaveText(String(api.leads.total));
      await expect(page.getByTestId("statistik-accepteret-vaerdi")).toHaveText(String(api.leads.accepted));
      await expect(page.getByTestId("statistik-accepteret")).toContainText(`${api.acceptRatePct} % af besvarede`);
      await expect(page.getByTestId("statistik-afvist-vaerdi")).toHaveText("0");
      await expect(page.getByTestId("statistik-svartid-vaerdi")).toHaveText(/under 1 min|\d+ min/);
      await expect(page.getByTestId("statistik-konvertering-vaerdi")).toHaveText("0 %");
      await expect(page.getByText("Kun jeres egne tal.")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/statistik-${page.viewportSize()!.width}.png`, fullPage: true });

      await page.getByRole("button", { name: "12 måneder" }).click();
      await page.waitForURL((url) => url.pathname === "/klinik/statistik" && url.searchParams.get("dage") === "365");
      await expect(page.getByRole("button", { name: "12 måneder" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("statistik-henvendelser-vaerdi")).toHaveText("1");

      // Perioden overlever en genindlæsning; en ukendt værdi giver standardperioden.
      await page.reload();
      await expect(page.getByRole("button", { name: "12 måneder" })).toHaveAttribute("aria-pressed", "true");
      await page.goto("/klinik/statistik?dage=7");
      await expect(page.getByRole("button", { name: "30 dage" })).toHaveAttribute("aria-pressed", "true");
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("en ikke-verificeret klinik ser en kort tekst", async ({ browser }, testInfo) => {
    const r = await verifiedClinic(browser, testInfo, "stat-r", false);
    try {
      await r.page.goto("/klinik/statistik");
      await expect(r.page.getByTestId("ikke-verificeret")).toContainText("Din statistik er ikke tilgængelig endnu.");
      await expectNoHorizontalScroll(r.page);
    } finally {
      await cleanup(null, [r]);
    }
  });
});
