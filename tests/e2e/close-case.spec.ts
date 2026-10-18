import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import { addListPrice, cleanup, expectNoHorizontalScroll, patientWithCase, sendTo, verifiedClinic, type ClinicHandle } from "./helpers/inbox";

// "Luk sag" (arbejdsplan 7.5, architecture 6.2): en sendt sag med et ubesvaret og et booket lead lukkes med bekræftelse.
// Klinikker og patienter oprettes via API'et; kører i 390 og 1280 px.

const PHONE = "12 34 56 78";

async function bookableClinic(browser: Browser, testInfo: TestInfo, label: string): Promise<ClinicHandle> {
  const clinic = await verifiedClinic(browser, testInfo, label);
  addListPrice(clinic.id);
  const hours = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, opensAt: "08:00", closesAt: "17:00", isEmergency: false }));
  const res = await clinic.page.request.put("/api/clinics/me/opening-hours", { data: { hours } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return clinic;
}

test.describe("luk sag", () => {
  test.setTimeout(180_000);

  test("lukker en sendt sag: det ubesvarede trækkes tilbage, bookingen består", async ({ browser }, testInfo) => {
    const answered = await bookableClinic(browser, testInfo, "luk-a");
    const silent = await bookableClinic(browser, testInfo, "luk-b");
    const patient = await patientWithCase(browser, testInfo);
    const page = patient.page;
    const width = page.viewportSize()!.width;
    try {
      const [bookedLeadId] = await sendTo(patient, [answered, silent]);
      expect((await answered.page.request.post(`/api/leads/${bookedLeadId}/decision`, { data: { decision: "accept" } })).ok()).toBeTruthy();
      const catalog = (await (await page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
      const serviceId = catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning")!.id;
      const { slots } = (await (await page.request.get(`/api/leads/${bookedLeadId}/availability?serviceId=${serviceId}`)).json()) as {
        slots: { startsAt: string }[];
      };
      const booked = await page.request.post(`/api/leads/${bookedLeadId}/booking`, {
        data: { serviceId, startsAt: slots[0].startsAt, contactName: "Lea Hansen", contactPhone: PHONE },
      });
      expect(booked.status(), await booked.text()).toBe(201);

      await page.goto(`/patient/sag/${patient.caseId}`);
      const closeButton = page.getByRole("button", { name: "Luk sag", exact: true });
      await expect(closeButton).toBeVisible();
      expect((await closeButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByTestId("lead")).toHaveCount(2);
      await expect(page.getByText("Afventer svar")).toHaveCount(1);
      await closeButton.scrollIntoViewIfNeeded();
      await closeButton.click();

      // Bekræftelsen nævner konsekvensen; Annuller ændrer intet.
      const box = page.getByTestId("luk-sag");
      await expect(box).toContainText("Bookede tider består");
      await expect(box).toContainText("en reserveret akuttid frigives");
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/luk-sag-bekraeft-${width}.png`, fullPage: true });
      await box.getByRole("button", { name: "Annuller" }).click();
      await expect(page.getByRole("button", { name: "Luk sag", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Luk sag", exact: true }).click();
      await box.getByRole("button", { name: "Ja, luk sagen" }).click();

      // Efter lukning: badget "Lukket", det ubesvarede er trukket tilbage, bookingen består, ingen knapper.
      await expect(page.getByText("Lukket", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Luk sag", exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Kontakt flere klinikker" })).toHaveCount(0);
      await expect(page.getByTestId("luk-sag")).toHaveCount(0);
      await expect(page.getByText("Trukket tilbage", { exact: true })).toHaveCount(1);
      await expect(page.getByText("Afventer svar")).toHaveCount(0);
      await expect(page.getByTestId("booking-tid")).toHaveCount(1);
      await expect(page.getByText("Booket", { exact: true })).toHaveCount(1);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/luk-sag-lukket-${width}.png`, fullPage: true });
    } finally {
      await cleanup(patient, [answered, silent]);
    }
  });

  test("knappen vises ikke på en kladde", async ({ browser }, testInfo) => {
    const patient = await patientWithCase(browser, testInfo);
    try {
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      await expect(patient.page.getByText("Sagen er ikke sendt endnu")).toBeVisible();
      await expect(patient.page.getByRole("button", { name: "Luk sag", exact: true })).toHaveCount(0);
      await expectNoHorizontalScroll(patient.page);
    } finally {
      await cleanup(patient, []);
    }
  });
});
