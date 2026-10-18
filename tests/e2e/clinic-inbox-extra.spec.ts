import { expect, test, type Page } from "@playwright/test";
import { addListPrice, cleanup, expectNoHorizontalScroll, patientWithCase, sendTo, verifiedClinic } from "./helpers/inbox";

// Supplerende tests til arbejdsplan 5.4: Accepter med ét tryk, lukket tråd for begge parter, ulæst-tællere, pæn fejl for ukendt
// lead-id og layoutrevision (horisontal scroll, overlap, trykflader under 44 px) af indbakke, lead-kort og beskedtråd.

// Layoutrevision: synlige trykflader under 44 px i højden og overlappende trykflader/overskrifter. Indlejrede elementer og
// tekstlinks midt i brødtekst tælles ikke.
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const label = (el: Element) => `${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}]`;
    const targets = [...document.querySelectorAll("main button, main input:not([type=hidden]), main select, main textarea, main a[data-testid], main [role=button]")].filter(visible);
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.height < 43.5) problems.push(`lille trykflade (${Math.round(r.height)} px): ${label(el)}`);
    }
    const boxes = [...targets, ...document.querySelectorAll("main h1, main h2")].filter(visible);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 1 && h > 1) problems.push(`overlap: ${label(a)} og ${label(b)}`);
      }
    }
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (overflow > 0) problems.push(`horisontal scroll (${overflow} px)`);
    return problems;
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/${name}-${page.viewportSize()!.width}.png`, fullPage: true });
}

test.describe("klinikkens indbakke: supplerende dækning (5.4)", () => {
  test.setTimeout(120_000);

  test("Accepter er ét tryk uden formular, tråden forbliver åben, og patienten ser accepten", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);
      await x.page.goto("/klinik");
      await x.page.getByTestId("lead-raekke").click(); // tryk 1: åbn
      await expect(x.page).toHaveURL(new RegExp(`/klinik/lead/${leadId}$`));

      let decisionCalls = 0;
      x.page.on("request", (req) => {
        if (req.method() === "POST" && req.url().endsWith(`/api/leads/${leadId}/decision`)) decisionCalls++;
      });
      await x.page.getByRole("button", { name: "Accepter", exact: true }).click(); // tryk 2: besvar
      await expect(x.page.getByTestId("dit-svar")).toContainText("Du har accepteret henvendelsen");
      expect(decisionCalls).toBe(1);
      // Ingen formular blev åbnet, og knapperne er væk.
      await expect(x.page.getByLabel("Kommentar til patienten")).toHaveCount(0);
      await expect(x.page.getByRole("button", { name: "Accepter", exact: true })).toHaveCount(0);
      // Tråden er stadig åben efter accept, og kontakt er stadig skjult (ingen tid booket).
      await expect(x.page.getByLabel("Skriv en besked")).toBeVisible();
      await expect(x.page.getByTestId("kontakt-skjult")).toBeVisible();
      await expect(x.page.getByTestId("traad-lukket")).toHaveCount(0);

      const detail = (await (await x.page.request.get(`/api/leads/${leadId}`)).json()) as { status: string; decision: { comment?: string | null } | null };
      expect(detail.status).toBe("accepted");
      expect(detail.decision?.comment ?? null).toBeNull();

      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      await expect(patient.page.getByTestId("lead")).toContainText("Accepteret");
      await patient.page.getByRole("button", { name: /^Beskeder/ }).click();
      await expect(patient.page.getByLabel("Skriv en besked")).toBeVisible();
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("afvisning lukker tråden for begge parter, også i API'et, og tidligere beskeder bevares", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);
      expect((await x.page.request.post(`/api/leads/${leadId}/messages`, { data: { body: "Et spørgsmål før afvisning" } })).ok()).toBeTruthy();
      expect((await x.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "decline", reason: "no_capacity" } })).ok()).toBeTruthy();

      // Begge parter får 409 THREAD_CLOSED ved forsøg på at skrive.
      for (const [who, page] of [["klinik", x.page], ["patient", patient.page]] as const) {
        const res = await page.request.post(`/api/leads/${leadId}/messages`, { data: { body: "Må jeg stadig skrive?" } });
        expect(res.status(), who).toBe(409);
        expect(((await res.json()) as { error?: { code?: string } }).error?.code, who).toBe("THREAD_CLOSED");
      }

      // UI hos klinikken: tidligere besked vises, men ingen inputfelt.
      await x.page.goto(`/klinik/lead/${leadId}`);
      await expect(x.page.getByTestId("besked")).toHaveCount(1);
      await expect(x.page.getByTestId("besked")).toContainText("Et spørgsmål før afvisning");
      await expect(x.page.getByTestId("traad-lukket")).toBeVisible();
      await expect(x.page.getByLabel("Skriv en besked")).toHaveCount(0);
      await expect(x.page.getByRole("button", { name: "Send besked" })).toHaveCount(0);
      await expect(x.page.getByTestId("beslutning")).toHaveCount(0);
      expect(await layoutProblems(x.page)).toEqual([]);
      await shot(x.page, "lead-afvist-lukket-traad");

      // UI hos patienten.
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      await patient.page.getByRole("button", { name: /^Beskeder/ }).click();
      await expect(patient.page.getByTestId("besked")).toHaveCount(1);
      await expect(patient.page.getByTestId("traad-lukket")).toBeVisible();
      await expect(patient.page.getByLabel("Skriv en besked")).toHaveCount(0);
      await shot(patient.page, "sag-lukket-traad");
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("tråden lukkes også for en klinik, hvis leadet afvises, mens tråden er åben (THREAD_CLOSED i UI)", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      await patient.page.getByRole("button", { name: /^Beskeder/ }).click();
      await expect(patient.page.getByLabel("Skriv en besked")).toBeVisible();
      // Klinikken afviser via API, mens patientens tråd er åben; patientens næste forsøg skal give en lukket tråd.
      expect((await x.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "decline", reason: "other" } })).ok()).toBeTruthy();
      await patient.page.getByLabel("Skriv en besked").fill("Er der nogen?");
      await patient.page.getByRole("button", { name: "Send besked" }).click();
      await expect(patient.page.getByTestId("traad-lukket")).toBeVisible();
      await expect(patient.page.getByLabel("Skriv en besked")).toHaveCount(0);
    } finally {
      await cleanup(patient, [x]);
    }
  });

  test("ulæst-tælleren i indbakken og på patientens sag falder efter læsning", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [x]);

      // Patienten skriver to beskeder -> klinikken ser "2 ulæste beskeder" i indbakken.
      for (const body of ["Første besked", "Anden besked"]) {
        expect((await patient.page.request.post(`/api/leads/${leadId}/messages`, { data: { body } })).ok()).toBeTruthy();
      }
      await x.page.goto("/klinik");
      const row = x.page.getByTestId("lead-raekke");
      await expect(row).toContainText("2 ulæste beskeder");
      expect(await layoutProblems(x.page)).toEqual([]);

      // Åbning af leadet henter tråden og markerer læst; indbakken viser ikke tælleren bagefter.
      await row.click();
      await expect(x.page.getByTestId("besked")).toHaveCount(2);
      await x.page.locator("main").getByRole("link", { name: /Henvendelser/ }).first().click();
      await expect(x.page.getByTestId("lead-raekke")).toHaveCount(1);
      await expect(x.page.getByTestId("lead-raekke")).not.toContainText("ulæst");
      const list = (await (await x.page.request.get("/api/leads")).json()) as { leads: { unreadMessages: number }[] };
      expect(list.leads[0].unreadMessages).toBe(0);

      // Klinikken skriver -> patientens sag viser "1 ulæst"; tælleren forsvinder, når tråden åbnes, og er væk efter genindlæsning.
      expect((await x.page.request.post(`/api/leads/${leadId}/messages`, { data: { body: "Svar fra klinikken" } })).ok()).toBeTruthy();
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      await expect(patient.page.getByTestId("ulaeste")).toHaveText("1 ulæst");
      await patient.page.getByRole("button", { name: /^Beskeder/ }).click();
      await expect(patient.page.getByTestId("besked")).toHaveCount(3);
      await patient.page.getByRole("button", { name: "Skjul beskeder" }).click();
      await expect(patient.page.getByTestId("ulaeste")).toHaveCount(0);
      await patient.page.reload();
      await expect(patient.page.getByTestId("lead")).toBeVisible();
      await expect(patient.page.getByTestId("ulaeste")).toHaveCount(0);

      // Egne beskeder tæller ikke som ulæste hos afsenderen.
      const own = (await (await patient.page.request.get(`/api/cases/${patient.caseId}/leads`)).json()) as { leads: { unreadMessages: number }[] };
      expect(own.leads[0].unreadMessages).toBe(0);
    } finally {
      await cleanup(patient, [x]);
    }
  });

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
        await expect(x.page.locator("main").getByRole("link", { name: /Henvendelser/ }).first()).toBeVisible();
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

  test("layout: indbakke, lead-kort før og efter beslutning, åben og lukket tråd", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "x");
    const patient = await patientWithCase(browser, testInfo);
    const problems: string[] = [];
    const note = async (page: Page, where: string) => {
      for (const p of await layoutProblems(page)) problems.push(`${where} (${page.viewportSize()!.width}px): ${p}`);
    };
    try {
      addListPrice(x.id);
      const [leadId] = await sendTo(patient, [x]);
      expect((await patient.page.request.post(`/api/leads/${leadId}/messages`, { data: { body: "Lang besked ".repeat(30) } })).ok()).toBeTruthy();

      await x.page.goto("/klinik");
      await expect(x.page.getByTestId("lead-raekke")).toHaveCount(1);
      await note(x.page, "indbakke");
      await shot(x.page, "audit-indbakke");

      await x.page.getByTestId("lead-raekke").click();
      await expect(x.page.getByTestId("opsummering")).toBeVisible();
      await expect(x.page.getByTestId("besked")).toHaveCount(1);
      await note(x.page, "lead før beslutning, åben tråd");
      await shot(x.page, "audit-lead-foer");

      await x.page.getByRole("button", { name: "Accepter med kommentar", exact: true }).click();
      await note(x.page, "accept-formular");
      await x.page.getByRole("button", { name: "Annuller" }).click();
      await x.page.getByRole("button", { name: "Afvis", exact: true }).click();
      await note(x.page, "afvis-formular");
      await x.page.getByRole("button", { name: "Annuller" }).click();

      await x.page.getByRole("button", { name: "Accepter", exact: true }).click();
      await expect(x.page.getByTestId("dit-svar")).toBeVisible();
      await note(x.page, "lead efter accept, åben tråd");
      await shot(x.page, "audit-lead-efter-accept");

      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      await patient.page.getByRole("button", { name: /^Beskeder/ }).click();
      await expect(patient.page.getByTestId("besked")).toHaveCount(1);
      await note(patient.page, "patientens sag, åben tråd");
      await shot(patient.page, "audit-sag-aaben-traad");

      expect(problems).toEqual([]);
    } finally {
      await cleanup(patient, [x]);
    }
  });
});
