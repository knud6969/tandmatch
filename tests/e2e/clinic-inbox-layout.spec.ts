import { expect, test } from "@playwright/test";
import { addImages, cleanup, expectNoHorizontalScroll, patientWithCase, sendTo, sql, verifiedClinic } from "./helpers/inbox";

// Lead-kortet som ét overblik og indbakken (features/clinics/README.md 6.3, 2026-10-24): rækkefølgen titel → opsummering →
// billeder → fakta → beskeder, svarbjælken fast i bunden på mobil og i toppen fra lg, billeder i én række med lightbox,
// "Kræver handling" og "Næste henvendelse", akut-fristen og bredt layout fra lg. Kører i begge viewports (390 og 1280 px).

const AKUT_CONTACT = "Akut Kontaktperson";

test.describe("lead-kort og indbakke: overblik og layout", () => {
  test.setTimeout(150_000);

  test("svarbjælken er altid synlig, og billederne står i én række med en lightbox", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "layout");
    const patient = await patientWithCase(browser, testInfo);
    try {
      await addImages(patient, 5);
      const [leadId] = await sendTo(patient, [x]);
      await x.page.goto(`/klinik/lead/${leadId}`);
      const accept = x.page.getByRole("button", { name: "Accepter", exact: true });
      await expect(accept).toBeInViewport({ ratio: 1 });
      await expect(x.page.getByRole("heading", { name: "Billeder (5)" })).toBeVisible();
      const thumbs = x.page.getByRole("button", { name: /^Forstør:/ });
      await expect(thumbs).toHaveCount(5);

      const width = x.page.viewportSize()!.width;
      const height = x.page.viewportSize()!.height;
      await x.page.screenshot({ path: `test-results/lead-kort-layout-${width}.png`, fullPage: true });

      // Billederne står i én række (samme y), ikke i et gitter.
      const first = (await thumbs.first().boundingBox())!;
      const second = (await thumbs.nth(1).boundingBox())!;
      expect(Math.abs(first.y - second.y)).toBeLessThan(2);

      // Bjælken bliver stående ved rulning: i bunden på mobil, i toppen fra lg.
      // På mobil er bjælken sticky i artiklen: midt i siden ligger den i bunden af skærmen, og helt nede (ved sidefoden) lander den
      // efter artiklens sidste indhold, men er stadig synlig.
      await x.page.mouse.wheel(0, 150);
      await expect(accept).toBeInViewport({ ratio: 1 });
      const bar = (await x.page.getByTestId("svarbjaelke").boundingBox())!;
      if (width < 1024) expect(bar.y + bar.height).toBeGreaterThan(height - 4);
      else expect(bar.y).toBeLessThan(height / 2);
      await x.page.mouse.wheel(0, 3000);
      await expect(accept).toBeInViewport({ ratio: 1 });

      // Lightbox: åbner stort, Esc lukker, og fokus vender tilbage til miniaturen.
      await x.page.evaluate(() => window.scrollTo(0, 0));
      await thumbs.first().click();
      const dialog = x.page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("img")).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Åbn i ny fane" })).toHaveAttribute("target", "_blank");
      await x.page.screenshot({ path: `test-results/lead-lightbox-${width}.png` });
      await x.page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(thumbs.first()).toBeFocused();
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("DOM-rækkefølgen er titel, svarbjælke, opsummering, billeder, fakta og beskeder; lang opsummering har Vis mere", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "fokus");
    const patient = await patientWithCase(browser, testInfo);
    try {
      await addImages(patient, 2);
      const [leadId] = await sendTo(patient, [x]);
      sql(
        `set session_replication_role = replica; update public.cases set summary_text = '${"Jeg har ondt i en kindtand, især når jeg drikker koldt. ".repeat(12)}' where id = '${patient.caseId}'`,
      );
      await x.page.goto(`/klinik/lead/${leadId}`);
      const accept = x.page.getByRole("button", { name: "Accepter", exact: true });
      await expect(accept).toBeVisible();

      const order = await x.page.evaluate(() => {
        const pos = (el: Element | null) => (el ? [...document.querySelectorAll("*")].indexOf(el) : -1);
        return ["#behov", "[data-testid=svarbjaelke]", "[data-testid=opsummering]", "#billeder", "[data-testid=fakta]", "#beskeder"].map((q) =>
          pos(document.querySelector(q)),
        );
      });
      expect(order.every((n) => n >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));

      // Opsummeringen er afkortet til 4 linjer, og "Vis mere" folder den ud.
      const more = x.page.getByRole("button", { name: "Vis mere" });
      await expect(more).toBeVisible();
      const clamped = (await x.page.getByTestId("opsummering").boundingBox())!.height;
      await more.click();
      await expect(x.page.getByRole("button", { name: "Vis mindre" })).toHaveAttribute("aria-expanded", "true");
      expect((await x.page.getByTestId("opsummering").boundingBox())!.height).toBeGreaterThan(clamped);
      await expect(x.page.getByTestId("forbehold")).toContainText("I laver den endelige vurdering");

      // Tab fra titlen når Accepter før alt andet.
      await x.page.getByRole("heading", { level: 1 }).evaluate((el) => {
        el.setAttribute("tabindex", "-1");
        (el as HTMLElement).focus();
      });
      await x.page.keyboard.press("Tab");
      await expect(accept).toBeFocused();
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("Kræver handling er standard, fanen viser antallet, og efter et svar åbner Næste henvendelse det næste lead", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "naeste");
    const p1 = await patientWithCase(browser, testInfo);
    const p2 = await patientWithCase(browser, testInfo);
    try {
      const [lead1] = await sendTo(p1, [x]);
      const [lead2] = await sendTo(p2, [x]); // nyest, så den står først
      await x.page.goto("/klinik");
      const nav = x.page.getByRole("navigation", { name: "Områdenavigation" });
      await expect(nav.getByRole("link", { name: /^Henvendelser\s*, 2 kræver handling$/ })).toBeVisible();
      await expect(x.page.getByRole("button", { name: "Kræver handling (2)" })).toHaveAttribute("aria-pressed", "true");
      const rows = x.page.getByTestId("lead-raekke");
      await expect(rows).toHaveCount(2);
      await expect(rows.first().getByTestId("ikke-aabnet")).toHaveCount(1);
      await expect(rows.first()).toContainText("Venter på svar");
      await expect(rows.first().getByTestId("uddrag")).toBeVisible();

      // Bredt layout fra lg: listen til venstre og en tom tilstand til højre.
      if (x.page.viewportSize()!.width >= 1024) {
        await expect(x.page.getByText("Vælg en henvendelse i listen.")).toBeVisible();
      }

      await rows.first().click();
      await x.page.waitForURL((url) => url.pathname === `/klinik/lead/${lead2}`);
      // Afvisning kræver et aktivt valg af årsag.
      await x.page.getByRole("button", { name: "Afvis", exact: true }).click();
      await x.page.getByRole("button", { name: "Send afvisning" }).click();
      await expect(x.page.getByText("Vælg en årsag.")).toBeVisible();
      await x.page.getByRole("button", { name: "Annuller" }).click();

      await x.page.getByRole("button", { name: "Accepter", exact: true }).click();
      const next = x.page.getByRole("link", { name: "Næste henvendelse (1 tilbage)" });
      await expect(next).toBeVisible();
      await expect(next).toBeInViewport();
      await expect(nav.getByRole("link", { name: /^Henvendelser\s*, 1 kræver handling$/ })).toBeVisible({ timeout: 10_000 });
      if (x.page.viewportSize()!.width >= 1024) {
        // Listen står ved siden af, og det åbne lead er markeret.
        await expect(x.page.locator(`[data-testid=lead-raekke][aria-current=page]`)).toHaveAttribute("href", `/klinik/lead/${lead2}`);
      }
      await next.click();
      await x.page.waitForURL((url) => url.pathname === `/klinik/lead/${lead1}`);
      await expect(x.page.getByRole("button", { name: "Accepter", exact: true })).toBeVisible();
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(p1, [x]);
      await cleanup(p2, []);
    }
  });

  test("akut-lead står før et nyere ikke-akut lead og viser fristen i rækken og på kortet uden kontakt", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "akut");
    const urgent = await patientWithCase(browser, testInfo);
    const normal = await patientWithCase(browser, testInfo);
    try {
      const [urgentLead] = await sendTo(urgent, [x]);
      const [normalLead] = await sendTo(normal, [x]); // sendes senere, så den er nyest
      sql(
        `set session_replication_role = replica; update public.cases set is_emergency = true where id = '${urgent.caseId}'; ` +
          `update public.leads set requested_service_id = (select id from public.services where slug = 'blegning'), requested_starts_at = date_trunc('hour', now()) + interval '1 day' where id = '${urgentLead}'; ` +
          `insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, hold_expires_at, contact_name, contact_phone, contact_email) ` +
          `select l.id, l.clinic_id, c.patient_id, (select id from public.services where slug = 'blegning'), date_trunc('hour', now()) + interval '1 day', ` +
          `date_trunc('hour', now()) + interval '1 day 30 minutes', 'held', now() + interval '20 minutes', '${AKUT_CONTACT}', '+45 12 34 56 78', 'akut@test.invalid' ` +
          `from public.leads l join public.cases c on c.id = l.case_id where l.id = '${urgentLead}'`,
      );

      await x.page.goto("/klinik");
      const rows = x.page.getByTestId("lead-raekke");
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText("Akut");
      await expect(rows.first().getByText("Akut", { exact: true })).toHaveCSS("color", "rgb(138, 28, 20)"); // tone danger
      await expect(rows.first()).toHaveAttribute("href", `/klinik/lead/${urgentLead}`);
      await expect(rows.last()).toHaveAttribute("href", `/klinik/lead/${normalLead}`);
      await expect(rows.last()).not.toContainText("Akut");
      await expect(rows.first().getByTestId("akut-frist")).toHaveText(/^Svar inden kl\. \d{2}\.\d{2}$/);
      expect((await rows.first().innerText()).match(/Ønsker tid/g)).toHaveLength(1);
      expect(await x.page.locator("main").innerText()).not.toContain(AKUT_CONTACT);
      // Intet verificeringsbanner (og ingen grøn besked) for en verificeret klinik.
      await expect(x.page.getByText("Afventer verificering")).toHaveCount(0);
      await expect(x.page.getByText("Din klinik er verificeret")).toHaveCount(0);
      await x.page.screenshot({ path: `test-results/indbakke-akut-${x.page.viewportSize()!.width}.png`, fullPage: true });

      await rows.first().click();
      await x.page.waitForURL((url) => url.pathname === `/klinik/lead/${urgentLead}`);
      const card = x.page.locator("article");
      await expect(card.getByTestId("akut-frist")).toHaveText(/^Svar inden kl\. \d{2}\.\d{2}$/);
      await expect(card.getByText("Tiden bliver booket, når du accepterer")).toBeVisible();
      await expect(card.getByTestId("fakta")).toContainText("Ønsker tid");
      expect((await card.getByTestId("fakta").innerText()).match(/Ønsker tid/g)).toHaveLength(1);
      await expect(card.getByTestId("kontakt-skjult")).toBeVisible();
      expect(await x.page.locator("main").innerText()).not.toContain(AKUT_CONTACT);
      await expectNoHorizontalScroll(x.page);
    } finally {
      await cleanup(urgent, [x]);
      await cleanup(normal, []);
    }
  });
});
