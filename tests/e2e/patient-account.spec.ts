import { expect, test } from "@playwright/test";
import { cleanup, expectNoHorizontalScroll, patientWithCase, sendTo, sql, verifiedClinic } from "./helpers/inbox";

// Patientens konto og samtykker (arbejdsplan 7.7, architecture 6.2): profil, tilbagetrækning med konsekvens, dataeksport og
// sletning af konto. Patient og klinik oprettes via API'et; kører i 390 og 1280 px.

test.describe("patientens konto og samtykker", () => {
  test.setTimeout(150_000);

  test("telefon gemmes og ryddes; navigationen har Konto", async ({ browser }, testInfo) => {
    const patient = await patientWithCase(browser, testInfo);
    const page = patient.page;
    const width = page.viewportSize()!.width;
    try {
      await page.goto("/patient/konto");
      await expect(page.getByRole("link", { name: "Konto", exact: true })).toHaveAttribute("aria-current", "page");
      const phone = page.getByLabel("Telefon");
      await phone.fill("12");
      await page.getByRole("button", { name: "Gem", exact: true }).click();
      await expect(page.getByText("Angiv et gyldigt telefonnummer.")).toBeVisible();

      await phone.fill("12 34 56 78");
      await page.getByLabel("Postnummer").fill("2100");
      await page.getByRole("button", { name: "Gem", exact: true }).click();
      await expect(page.getByText(/Gemt kl\./)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/patient-konto-${width}.png`, fullPage: true });

      await page.reload();
      await expect(page.getByLabel("Telefon")).toHaveValue("12 34 56 78");
      await page.getByLabel("Telefon").fill("");
      await page.getByRole("button", { name: "Gem", exact: true }).click();
      await expect(page.getByText(/Gemt kl\./)).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Telefon")).toHaveValue("");
    } finally {
      await cleanup(patient, []);
    }
  });

  test("tilbagetrækning af delingssamtykke viser konsekvensen og antal tilbagetrukne henvendelser", async ({ browser }, testInfo) => {
    const clinic = await verifiedClinic(browser, testInfo, "samtykke");
    const patient = await patientWithCase(browser, testInfo);
    const page = patient.page;
    const width = page.viewportSize()!.width;
    try {
      await sendTo(patient, [clinic]);
      await page.goto("/patient/samtykker");
      const row = page.getByTestId("samtykkerække-health_data_sharing");
      await expect(row.getByText("Givet", { exact: true })).toBeVisible();
      await row.getByRole("button", { name: /Træk tilbage/ }).click();
      await expect(row).toContainText("Bookede tider består");
      await expect(row).toContainText("Du skal give samtykke igen");
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/patient-samtykker-bekraeft-${width}.png`, fullPage: true });

      // Fortryd ændrer intet.
      await row.getByRole("button", { name: "Behold samtykket" }).click();
      await expect(row.getByText("Givet", { exact: true })).toBeVisible();

      await row.getByRole("button", { name: /Træk tilbage/ }).click();
      await row.getByRole("button", { name: "Ja, træk samtykket tilbage" }).click();
      await expect(page.getByText("1 henvendelse er trukket tilbage.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Bookinger", exact: true }).last()).toBeVisible();
      await expect(row.getByText("Ikke givet", { exact: true })).toBeVisible();
      await expect(row.getByRole("button", { name: "Giv samtykke", exact: true })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/patient-samtykker-tilbagetrukket-${width}.png`, fullPage: true });

      // Giv igen: kræver afkrydsning.
      await row.getByRole("button", { name: "Giv samtykke", exact: true }).click();
      const give = row.getByRole("button", { name: "Giv samtykke", exact: true });
      await expect(give).toBeDisabled();
      await row.getByLabel("Jeg giver mit samtykke").check();
      await give.click();
      await expect(row.getByText("Givet", { exact: true })).toBeVisible();
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("et samtykke i en ældre tekstversion vises med knap til at give det igen", async ({ browser }, testInfo) => {
    const patient = await patientWithCase(browser, testInfo);
    const page = patient.page;
    try {
      // Erstat det gældende delingssamtykke med et i v0 (kun lokal database, via tests/e2e/helpers).
      const me = (await (await page.request.get("/api/me")).json()) as { id: string };
      sql(`update public.consents set text_version = 'health_data_sharing@v0-prototype' where type = 'health_data_sharing' and patient_id = '${me.id}'`);
      await page.goto("/patient/samtykker");
      const row = page.getByTestId("samtykkerække-health_data_sharing");
      await expect(row.getByText("Ældre tekst", { exact: true })).toBeVisible();
      await expect(row).toContainText("ældre tekst");
      await expect(row.getByRole("button", { name: "Giv samtykke igen" })).toBeVisible();
    } finally {
      await cleanup(patient, []);
    }
  });

  test("dataeksporten henter en JSON-fil", async ({ browser }, testInfo) => {
    const patient = await patientWithCase(browser, testInfo);
    const page = patient.page;
    try {
      await page.goto("/patient/konto");
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Hent mine data" }).click()]);
      expect(download.suggestedFilename()).toMatch(/^tandmatch-data-\d{4}-\d{2}-\d{2}\.json$/);
      const stream = await download.createReadStream();
      let text = "";
      for await (const chunk of stream) text += chunk;
      const json = JSON.parse(text) as { cases: unknown[]; consents: unknown[] };
      expect(json.cases.length).toBe(1);
      expect(json.consents.length).toBeGreaterThan(0);
    } finally {
      await cleanup(patient, []);
    }
  });

  test("sletning af konto kræver SLET og logger ud", async ({ browser }, testInfo) => {
    const patient = await patientWithCase(browser, testInfo);
    const page = patient.page;
    const width = page.viewportSize()!.width;
    try {
      await page.goto("/patient/konto");
      await page.getByRole("button", { name: "Slet kontoen …" }).click();
      await expect(page.getByText("Kommende tider forsvinder fra klinikkens kalender")).toBeVisible();
      const confirm = page.getByRole("button", { name: "Slet kontoen permanent" });
      await expect(confirm).toBeDisabled();
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/patient-slet-konto-${width}.png`, fullPage: true });
      await page.getByLabel("Skriv SLET for at bekræfte").fill("SLET");
      await confirm.click();
      await page.waitForURL((url) => url.pathname === "/");
      await expect(page.getByRole("link", { name: "Log ind" }).first()).toBeVisible();
      expect((await page.request.get("/api/me")).status()).toBe(401);
    } finally {
      await page.context().close();
    }
  });
});
