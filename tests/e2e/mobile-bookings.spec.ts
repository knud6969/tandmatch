import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import {
  addListPrice,
  cleanup,
  expectNoHorizontalScroll,
  newPage,
  patientWithCase,
  sendTo,
  sql,
  verifiedClinic,
  type ClinicHandle,
} from "./helpers/inbox";

// Mobil og dubletter (arbejdsplan 6.7b): fast bundlinje på bookingsiden, datoer i stedet for "Dag 15 til 28", kalenderen der starter
// ved i dag med tidligere dage bag en knap, sagens næste booking på /patient og den fælles tidsliste i klinikoversigten.
// Alt kører mod den LOKALE database (helpers/inbox.ts afviser andet end localhost).

const PHONE = "12 34 56 78";
type Patient = { page: Page; caseId: string };
const width = (page: Page) => page.viewportSize()!.width;

async function bookableClinic(browser: Browser, testInfo: TestInfo, label: string): Promise<ClinicHandle> {
  const clinic = await verifiedClinic(browser, testInfo, label);
  addListPrice(clinic.id);
  const hours = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, opensAt: "08:00", closesAt: "17:00", isEmergency: false }));
  const res = await clinic.page.request.put("/api/clinics/me/opening-hours", { data: { hours } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return clinic;
}

async function acceptedLead(patient: Patient, clinic: ClinicHandle): Promise<string> {
  const [leadId] = await sendTo(patient, [clinic]);
  const res = await clinic.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "accept" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return leadId;
}

async function bookViaApi(patient: Patient, leadId: string, slotIndex = 0): Promise<{ id: string; startsAt: string }> {
  const catalog = (await (await patient.page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
  const serviceId = catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning")!.id;
  const avail = await patient.page.request.get(`/api/leads/${leadId}/availability?serviceId=${serviceId}`);
  const { slots } = (await avail.json()) as { slots: { startsAt: string }[] };
  const res = await patient.page.request.post(`/api/leads/${leadId}/booking`, {
    data: { serviceId, startsAt: slots[slotIndex].startsAt, contactName: "Lea Hansen", contactPhone: PHONE },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; startsAt: string };
}

test.describe("mobil og dubletter (6.7b)", () => {
  test.setTimeout(180_000);

  test("bundlinjen viser den valgte tid og Book tid, datoer i stedet for dagtal, og /patient viser næste booking", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "bundlinje");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      const page = patient.page;
      await page.goto(`/patient/sag/${patient.caseId}/book/${leadId}`);
      await expect(page.getByTestId("tid").first()).toBeVisible();

      // Datoer, ikke "Dag 15 til 28".
      await expect(page.getByTestId("tidsrum")).toHaveText(/^\d{1,2}\. \p{L}+ til \d{1,2}\. \p{L}+$/u);
      await expect(page.getByText(/Dag \d+ til \d+/)).toHaveCount(0);
      await page.getByRole("button", { name: /Senere dage/ }).click();
      await expect(page.getByTestId("tid").first()).toBeVisible();
      await expect(page.getByTestId("tidsrum")).toHaveText(/^\d{1,2}\. \p{L}+ til \d{1,2}\. \p{L}+$/u);
      await page.getByRole("button", { name: /Tidligere dage/ }).click();

      // Uden valgt tid: bundlinjen beder om en tid, og Book tid er slået fra.
      const bar = page.getByTestId("bundlinje");
      await expect(bar).toContainText("Vælg en tid");
      await expect(bar.getByRole("button", { name: "Book tid", exact: true })).toBeDisabled();

      // Tryk på den sidste tid på siden (langt fra formularen): bundlinjen ligger stadig i viewport.
      const lastTime = page.getByTestId("tid").last();
      await lastTime.scrollIntoViewIfNeeded();
      await lastTime.click();
      const clicked = await lastTime.innerText();
      await expect(bar.getByTestId("valgt-tid")).toContainText(clicked); // klokkeslæt, fx "09.15"
      const button = bar.getByRole("button", { name: "Book tid", exact: true });
      await expect(button).toBeEnabled();
      await expect(button).toBeInViewport({ ratio: 1 });
      await expect(bar).toBeInViewport({ ratio: 1 });
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/book-bundlinje-${width(page)}.png` });
      await page.screenshot({ path: `test-results/book-bundlinje-side-${width(page)}.png`, fullPage: true });

      // Book fra bundlinjen (knappen står uden for formularen).
      await page.getByLabel("Fulde navn").fill("Lea Hansen");
      await page.getByLabel("Telefon").fill(PHONE);
      await button.click();
      await expect(page.getByTestId("booking-bekraeftelse")).toBeVisible();

      // /patient viser sagens næste booking.
      await page.goto("/patient");
      const next = page.getByTestId("sag").getByTestId("naeste-booking");
      await expect(next).toContainText("Næste tid");
      await expect(next).toContainText(clinic.name);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/patient-naeste-booking-${width(page)}.png`, fullPage: true });
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("kalenderen starter med I dag, og tidligere dage ligger bag en knap", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "idag");
    const past = await patientWithCase(browser, testInfo);
    const future = await patientWithCase(browser, testInfo);
    try {
      const pastBooking = await bookViaApi(past, await acceptedLead(past, clinic));
      await bookViaApi(future, await acceptedLead(future, clinic));
      // Den ene booking flyttes tre dage tilbage (kvarterstid; triggere omgås kun i den lokale testdatabase).
      const start = "date_trunc('hour', now() - interval '3 days') + interval '15 minutes'";
      sql(
        `set session_replication_role = replica; update public.bookings set starts_at = ${start}, ends_at = ${start} + interval '30 minutes' where id = '${pastBooking.id}'`,
      );

      await clinic.page.goto("/klinik/kalender");
      const days = clinic.page.getByTestId("kalender-dag");
      await expect(days.first()).toContainText("I dag");
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveCount(1); // kun den fremtidige
      const show = clinic.page.getByRole("button", { name: "Vis tidligere dage (1)" });
      await expect(show).toBeVisible();
      expect((await show.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalScroll(clinic.page);
      await clinic.page.screenshot({ path: `test-results/kalender-idag-${width(clinic.page)}.png`, fullPage: true });

      await show.click();
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveCount(2);
      await expect(days.first()).not.toContainText("I dag"); // tidligere dage står før i dag
      await expect(clinic.page.getByRole("button", { name: "Skjul tidligere dage" })).toBeVisible();
      await expectNoHorizontalScroll(clinic.page);
      await clinic.page.screenshot({ path: `test-results/kalender-tidligere-${width(clinic.page)}.png`, fullPage: true });
    } finally {
      await cleanup(past, [clinic]);
      await cleanup(future, []);
    }
  });

  test("6. booking på samme lead viser loftet og et link til beskedtråden; telefon under 8 cifre afvises", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "loft");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      for (let i = 0; i < 5; i++) {
        const booking = await bookViaApi(patient, leadId, i * 2);
        const cancel = await patient.page.request.post(`/api/bookings/${booking.id}/cancel`, { data: {} });
        expect(cancel.ok(), await cancel.text()).toBeTruthy();
      }
      const page = patient.page;
      await page.goto(`/patient/sag/${patient.caseId}/book/${leadId}`);
      await expect(page.getByTestId("tid").first()).toBeVisible();
      await page.getByTestId("tid").first().click();
      await page.getByLabel("Fulde navn").fill("Lea Hansen");

      // Kontaktfelter: for kort telefonnummer afvises før noget sendes.
      await page.getByLabel("Telefon").fill("1234567");
      const bar = page.getByTestId("bundlinje");
      await bar.getByRole("button", { name: "Book tid", exact: true }).click();
      await expect(page.getByTestId("booking-bekraeftelse")).toHaveCount(0);
      await expect(page.getByText("Der er lavet og aflyst så mange tider")).toHaveCount(0);

      await page.getByLabel("Telefon").fill(PHONE);
      await bar.getByRole("button", { name: "Book tid", exact: true }).click();
      await expect(page.getByText(/Der er lavet og aflyst så mange tider på denne henvendelse \(højst 5\)/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Gå til beskedtråden med klinikken" })).toBeVisible();
      await expect(page.getByTestId("booking-bekraeftelse")).toHaveCount(0);
      await expectNoHorizontalScroll(page);
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("en ikke-verificeret klinik ser en kort tekst på kalender og anmeldelser", async ({ browser }, testInfo) => {
    const clinic = await verifiedClinic(browser, testInfo, "uverificeret", false);
    try {
      for (const path of ["/klinik/kalender", "/klinik/anmeldelser"]) {
        await clinic.page.goto(path);
        await expect(clinic.page.getByTestId("ikke-verificeret")).toBeVisible();
        await expectNoHorizontalScroll(clinic.page);
      }
      await clinic.page.screenshot({ path: `test-results/ikke-verificeret-${width(clinic.page)}.png`, fullPage: true });
    } finally {
      await cleanup(null, [clinic]);
    }
  });

  test("klinikprofilen viser ledige tider med den fælles tidsliste", async ({ browser }, testInfo) => {
    const page = await newPage(browser, testInfo);
    try {
      // Demodata (npm run seed:demo): en verificeret klinik med prisliste og åbningstider.
      const { clinics } = (await (await page.request.get("/api/clinics")).json()) as { clinics: { id: string; tier: string }[] };
      const full = clinics.find((c) => c.tier === "full");
      expect(full, "Kør npm run seed:demo: der mangler verificerede klinikker").toBeTruthy();
      await page.goto(`/klinikker/${full!.id}`);
      const list = page.getByTestId("tidsliste");
      await expect(list).toBeVisible();
      await expect(list.getByTestId("dag").first()).toBeVisible();
      await expect(list.getByTestId("tid-visning").first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      await list.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/profil-ledige-tider-${width(page)}.png` });
    } finally {
      await page.context().close();
    }
  });
});
