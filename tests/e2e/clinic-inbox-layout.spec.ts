import { expect, test } from "@playwright/test";
import { addImages, cleanup, expectNoHorizontalScroll, patientWithCase, sendTo, sql, verifiedClinic } from "./helpers/inbox";

// Arbejdsplan 5.5b: lead-kortets rækkefølge (Accepter over billederne på mobil, sticky højre kolonne på desktop),
// indbakkens rækkefølge (akut først) og tekster for akut-lead med ønsket tid. Kører i begge viewports (390 og 1280 px).

test.describe("lead-kort og indbakke: rækkefølge og layout (5.5b)", () => {
  test.setTimeout(150_000);

  test("Accepter står over billederne ved 390 px, og højre kolonne er sticky ved 1280 px", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "layout");
    const patient = await patientWithCase(browser, testInfo);
    try {
      await addImages(patient, 5);
      const [leadId] = await sendTo(patient, [x]);
      await x.page.goto(`/klinik/lead/${leadId}`);
      const accept = x.page.getByRole("button", { name: "Accepter", exact: true });
      await expect(accept).toBeVisible();
      const images = x.page.getByRole("list").filter({ has: x.page.getByRole("img") }).getByRole("img");
      await expect(images).toHaveCount(5);
      await expect(x.page.getByRole("heading", { name: /Billeder fra patienten \(5\)/ })).toBeVisible();

      const width = x.page.viewportSize()!.width;
      await x.page.screenshot({ path: `test-results/lead-kort-layout-${width}.png`, fullPage: true });
      const acceptBox = (await accept.boundingBox())!;
      const firstImageBox = (await images.first().boundingBox())!;
      const summaryBox = (await x.page.getByTestId("opsummering").boundingBox())!;
      if (width < 1024) {
        // Mobil: beslutningen kommer før opsummering og billeder, og knappen er synlig uden at scrolle.
        expect(acceptBox.y).toBeLessThan(summaryBox.y);
        expect(acceptBox.y).toBeLessThan(firstImageBox.y);
        // Knappen starter i første skærmbillede (faktaboksen er høj på 390 px, så hele knappen kan ligge få pixel under kanten).
        expect(acceptBox.y).toBeLessThan(x.page.viewportSize()!.height - 24);
      } else {
        // Desktop: højre kolonne er sticky og bliver stående i toppen, mens siden scroller.
        const column = x.page.getByTestId("beslutning").locator("xpath=ancestor::div[contains(@class,'lg:sticky')][1]");
        expect(await column.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
        const scrollable = await x.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        if (scrollable > 200) {
          await x.page.mouse.wheel(0, 400);
          await x.page.waitForFunction(() => window.scrollY > 100);
          const top = (await x.page.getByTestId("beslutning").boundingBox())!.y;
          expect(top).toBeGreaterThanOrEqual(0);
          expect(top).toBeLessThan(60);
          await expect(accept).toBeInViewport();
          await x.page.evaluate(() => window.scrollTo(0, 0));
        }
      }
      // Billedtallet står i sektionsoverskriften og ikke som faktarække.
      await expect(x.page.getByText("Billeder", { exact: true })).toHaveCount(0);
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("indbakken viser akut-lead før et nyere ikke-akut lead, og akut-leadet viser ønsket tid én gang", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "akut");
    const urgent = await patientWithCase(browser, testInfo);
    const normal = await patientWithCase(browser, testInfo);
    try {
      const [urgentLead] = await sendTo(urgent, [x]);
      const [normalLead] = await sendTo(normal, [x]); // sendes senere, så den er nyest
      sql(
        `set session_replication_role = replica; update public.cases set is_emergency = true where id = '${urgent.caseId}'; ` +
          `update public.leads set requested_service_id = (select id from public.services where slug = 'blegning'), requested_starts_at = now() + interval '1 day' where id = '${urgentLead}'`,
      );

      await x.page.goto("/klinik");
      const rows = x.page.getByTestId("lead-raekke");
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText("Akut");
      await expect(rows.first().getByText("Akut", { exact: true })).toHaveCSS("color", "rgb(138, 28, 20)"); // tone danger
      await expect(rows.first()).toHaveAttribute("href", `/klinik/lead/${urgentLead}`);
      await expect(rows.last()).toHaveAttribute("href", `/klinik/lead/${normalLead}`);
      await expect(rows.last()).not.toContainText("Akut");
      expect((await rows.first().innerText()).match(/Ønsker tid/g)).toHaveLength(1);
      // Kun ét verificeringsbanner (og slet ingen for en verificeret klinik i indbakken).
      await expect(x.page.getByText("Indbakken åbner, når klinikken er verificeret")).toHaveCount(0);
      await x.page.screenshot({ path: `test-results/indbakke-akut-${x.page.viewportSize()!.width}.png`, fullPage: true });

      await rows.first().click();
      await expect(x.page.getByText("Tiden bliver booket, når du accepterer")).toBeVisible();
      await expect(x.page.getByText("kan patienten booke")).toHaveCount(0);
      await expect(x.page.getByText("Ønsket tid", { exact: true })).toHaveCount(1);
      await expect(x.page.getByText(/Ønsker tid/)).toHaveCount(0);
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(urgent, [x]);
      await cleanup(normal, []);
    }
  });
});
