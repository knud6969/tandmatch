import { expect, test } from "@playwright/test";
import { addImages, cleanup, expectNoHorizontalScroll, patientWithCase, sendTo, sql, verifiedClinic } from "./helpers/inbox";

// Arbejdsplan 5.5b: lead-kortets rækkefølge (Accepter over billederne på mobil, grid uden indlejret scroll på desktop),
// indbakkens rækkefølge (akut først) og tekster for akut-lead med ønsket tid. Kører i begge viewports (390 og 1280 px).

test.describe("lead-kort og indbakke: rækkefølge og layout (5.5b)", () => {
  test.setTimeout(150_000);

  test("hele Accepter er synlig ved 390 x 844, og desktop har to kolonner uden indlejret scroll", async ({ browser }, testInfo) => {
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
        // Hele knappen er synlig i første skærmbillede (390 x 844), uden at scrolle.
        await expect(accept).toBeInViewport({ ratio: 1 });
        expect(acceptBox.y + acceptBox.height).toBeLessThanOrEqual(x.page.viewportSize()!.height);
      } else {
        // Desktop: beslutningen står i højre kolonne ud for faktaboksen, og siden har ingen indlejret scroll i kolonnen.
        const factBox = (await x.page.getByTestId("fakta").boundingBox())!;
        const decisionBox = (await x.page.getByTestId("beslutning").boundingBox())!;
        expect(decisionBox.x).toBeGreaterThan(factBox.x + factBox.width);
        expect(Math.abs(decisionBox.y - factBox.y)).toBeLessThan(40);
        const nested = await x.page.evaluate(() =>
          [...document.querySelectorAll("main *")].filter((el) => {
            const o = getComputedStyle(el).overflowY;
            return (o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 1 && el.tagName !== "TEXTAREA";
          }).length,
        );
        expect(nested).toBe(0);
      }
      // Billedtallet står i sektionsoverskriften og ikke som faktarække.
      await expect(x.page.getByText("Billeder", { exact: true })).toHaveCount(0);
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("fokusrækkefølgen følger mobilrækkefølgen, og der er intet hul under faktakortet ved lang tråd uden billeder", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "fokus");
    const patient = await patientWithCase(browser, testInfo);
    try {
      await addImages(patient, 2);
      const [leadId] = await sendTo(patient, [x]);
      await x.page.goto(`/klinik/lead/${leadId}`);
      const accept = x.page.getByRole("button", { name: "Accepter", exact: true });
      await expect(accept).toBeVisible();
      await expect(x.page.getByRole("heading", { name: /Billeder fra patienten/ })).toBeVisible();

      // DOM-rækkefølge: fakta, beslutning, opsummering, billeder, beskeder.
      const order = await x.page.evaluate(() => {
        const pos = (el: Element | null) => (el ? [...document.querySelectorAll("*")].indexOf(el) : -1);
        return ["[data-testid=fakta]", "[data-testid=beslutning]", "[data-testid=opsummering]", "#billeder", "#beskeder"].map((q) =>
          pos(document.querySelector(q)),
        );
      });
      expect(order.every((n) => n >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));

      // Tab fra faktaboksen når Accepter før det første billede (billederne har ingen fokuspunkter, så Accepter er første stop).
      await x.page.getByRole("heading", { level: 1 }).evaluate((el) => {
        el.setAttribute("tabindex", "-1");
        (el as HTMLElement).focus();
      });
      let reached = "";
      for (let i = 0; i < 6 && reached === ""; i++) {
        await x.page.keyboard.press("Tab");
        reached = await x.page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el?.textContent?.trim() === "Accepter" ? "accept" : "";
        });
      }
      expect(reached).toBe("accept");
      await x.page.evaluate(() => window.scrollTo(0, 0));
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("ved 1280 px er der intet hul under faktakortet, selv med lang tråd og uden billeder", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "hul");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);
      for (let i = 0; i < 6; i++) {
        const res = await patient.page.request.post(`/api/leads/${leadId}/messages`, { data: { body: `Besked ${i + 1}. ${"Lang tekst om tænderne. ".repeat(10)}` } });
        if (!res.ok()) break;
      }
      await x.page.goto(`/klinik/lead/${leadId}`);
      await expect(x.page.getByRole("button", { name: "Accepter", exact: true })).toBeVisible();
      await expect(x.page.getByRole("heading", { name: "Beskeder" })).toBeVisible();
      await x.page.screenshot({ path: `test-results/lead-kort-lang-traad-${x.page.viewportSize()!.width}.png`, fullPage: true });
      if (x.page.viewportSize()!.width >= 1024) {
        const fact = (await x.page.getByTestId("fakta").boundingBox())!;
        const summary = (await x.page.getByTestId("opsummering").boundingBox())!;
        // Opsummeringen står lige under faktakortet (kun gabet mellem kortene), uanset hvor høj højre kolonne er.
        expect(summary.y - (fact.y + fact.height)).toBeLessThan(120);
      }
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
      // Intet verificeringsbanner (og ingen grøn besked) for en verificeret klinik.
      await expect(x.page.getByText("Afventer verificering")).toHaveCount(0);
      await expect(x.page.getByText("Din klinik er verificeret")).toHaveCount(0);
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
