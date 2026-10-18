import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import {
  addListPrice,
  cleanup,
  expectNoHorizontalScroll,
  showPastDays,
  patientWithCase,
  sendTo,
  sql,
  verifiedClinic,
  type ClinicHandle,
} from "./helpers/inbox";

// Patientens booking og klinikkens kalender (arbejdsplan 6.3 og 6.4): booking efter accept, kontakt i kalender og på lead-kortet,
// aflysning frigiver tiden, udeblevet-knappen kun i vinduet og afvisning af en optaget tid i UI'et.
// Klinikker og patienter oprettes via API'et; tider flyttes direkte i den LOKALE database (helpers/inbox.ts afviser andet end localhost).

const PHONE = "12 34 56 78";
type Patient = { page: Page; caseId: string };

async function bookableClinic(browser: Browser, testInfo: TestInfo, label: string): Promise<ClinicHandle> {
  const clinic = await verifiedClinic(browser, testInfo, label);
  addListPrice(clinic.id);
  const hours = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, opensAt: "08:00", closesAt: "17:00", isEmergency: false }));
  const res = await clinic.page.request.put("/api/clinics/me/opening-hours", { data: { hours } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return clinic;
}

// Patienten sender sagen til klinikken, og klinikken accepterer. Returnerer leadets id.
async function acceptedLead(patient: Patient, clinic: ClinicHandle): Promise<string> {
  const [leadId] = await sendTo(patient, [clinic]);
  const res = await clinic.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "accept" } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return leadId;
}

async function firstSlot(patient: Patient, leadId: string): Promise<{ serviceId: string; startsAt: string }> {
  const catalog = (await (await patient.page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
  const serviceId = catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning")!.id;
  const res = await patient.page.request.get(`/api/leads/${leadId}/availability?serviceId=${serviceId}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  const { slots } = (await res.json()) as { slots: { startsAt: string }[] };
  return { serviceId, startsAt: slots[0].startsAt };
}

async function bookViaApi(patient: Patient, leadId: string): Promise<{ id: string; startsAt: string }> {
  const slot = await firstSlot(patient, leadId);
  const res = await patient.page.request.post(`/api/leads/${leadId}/booking`, {
    data: { ...slot, contactName: "Lea Hansen", contactPhone: PHONE },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; startsAt: string };
}

function width(page: Page): number {
  return page.viewportSize()!.width;
}

test.describe("booking og kalender", () => {
  test.setTimeout(180_000);

  test("patienten booker efter accept, og klinikken ser kontakten i kalenderen og på lead-kortet", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "book");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);

      // Sagen: det accepterede lead har "Book tid".
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      const link = patient.page.getByRole("link", { name: /Book tid/ });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await link.click();
      await expect(patient.page).toHaveURL(new RegExp(`/patient/sag/${patient.caseId}/book/${leadId}$`));

      // Bookingsiden: navn forudfyldt, tider pr. dag, book-knap er slået fra uden valgt tid.
      await expect(patient.page.getByRole("heading", { level: 1 })).toContainText(clinic.name);
      await expect(patient.page.getByLabel("Fulde navn")).toHaveValue("Lea");
      await expect(patient.page.getByTestId("tid").first()).toBeVisible();
      await expect(patient.page.getByRole("button", { name: "Book tid", exact: true })).toBeDisabled();
      const timeButton = patient.page.getByTestId("tid").first();
      expect((await timeButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/book-tid-${width(patient.page)}.png`, fullPage: true });

      // Bladr 14 dage frem og tilbage.
      await patient.page.getByRole("button", { name: /Senere dage/ }).click();
      await expect(patient.page.getByTestId("tid").first()).toBeVisible();
      await patient.page.getByRole("button", { name: /Tidligere dage/ }).click();

      await patient.page.getByTestId("tid").first().click();
      await expect(patient.page.getByTestId("valgt-tid")).toBeVisible();
      await patient.page.getByLabel("Fulde navn").fill("Lea Hansen");
      await patient.page.getByLabel("Telefon").fill(PHONE);
      await patient.page.getByRole("button", { name: "Book tid", exact: true }).click();
      await expect(patient.page.getByTestId("booking-bekraeftelse")).toBeVisible();
      await expect(patient.page.getByRole("heading", { level: 1 })).toHaveText("Din tid er booket");
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/book-bekraeftelse-${width(patient.page)}.png`, fullPage: true });

      // Sagen: bookingen med tid og "Aflys".
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      const lead = patient.page.getByTestId("lead");
      await expect(lead).toContainText("Booket");
      await expect(lead.getByTestId("booking-tid")).toBeVisible();
      await expect(lead.getByRole("button", { name: /^Aflys/ })).toBeVisible();
      await expect(patient.page.getByRole("link", { name: /Book tid/ })).toHaveCount(0);
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/sag-booking-${width(patient.page)}.png`, fullPage: true });

      // Bookingsoversigten (og navigationspunktet).
      await patient.page.goto("/patient/bookinger");
      await expect(patient.page.getByTestId("kommende")).toContainText(clinic.name);
      await expect(patient.page.getByTestId("kommende")).toContainText("Blegning");
      await expect(patient.page.getByTestId("kommende").getByRole("button", { name: /^Aflys/ })).toBeVisible();
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/bookinger-${width(patient.page)}.png`, fullPage: true });

      // Klinikkens kalender: tid, ydelse, status og kontakt.
      await clinic.page.goto("/klinik/kalender");
      const booking = clinic.page.getByTestId("kalender-booking");
      await expect(booking).toHaveCount(1);
      await expect(booking).toContainText("Booket");
      await expect(booking).toContainText("Blegning");
      await expect(clinic.page.getByTestId("kalender-kontakt")).toContainText("Lea Hansen");
      await expect(clinic.page.getByTestId("kalender-kontakt")).toContainText(PHONE);
      await expect(clinic.page.getByTestId("kalender-kontakt")).toContainText("@example.com");
      await expect(booking.getByRole("button", { name: "Aflys" })).toBeVisible();
      await expect(booking.getByRole("button", { name: "Marker udeblevet" })).toHaveCount(0);
      await expectNoHorizontalScroll(clinic.page);
      await clinic.page.screenshot({ path: `test-results/kalender-${width(clinic.page)}.png`, fullPage: true });

      // Lead-kortet efter booking: tid og kontakt.
      await booking.getByRole("link", { name: "Se henvendelsen" }).click();
      await expect(clinic.page).toHaveURL(new RegExp(`/klinik/lead/${leadId}$`));
      await expect(clinic.page.getByTestId("patient-kontakt")).toContainText("Lea Hansen");
      await expect(clinic.page.getByTestId("patient-kontakt")).toContainText(PHONE);
      await expect(clinic.page.getByTestId("kontakt-skjult")).toHaveCount(0);
      await expectNoHorizontalScroll(clinic.page);
      await clinic.page.screenshot({ path: `test-results/lead-kort-booket-${width(clinic.page)}.png`, fullPage: true });
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("aflysning frigiver tiden", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "aflys");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      const serviceOf = (await firstSlot(patient, leadId)).serviceId;
      const booking = await bookViaApi(patient, leadId);

      // Tiden er optaget, mens bookingen står (klinikkens offentlige ledige tider).
      const publicSlots = async () => {
        const serviceId = serviceOf;
        const res = await patient.page.request.get(`/api/clinics/${clinic.id}/availability?serviceId=${serviceId}`);
        return ((await res.json()) as { slots: { startsAt: string }[] }).slots.map((s) => s.startsAt);
      };
      expect(await publicSlots()).not.toContain(booking.startsAt);

      await patient.page.goto("/patient/bookinger");
      await patient.page.getByRole("button", { name: /^Aflys/ }).click();
      await expect(patient.page.getByRole("group", { name: "Bekræft aflysning" })).toBeVisible();
      await patient.page.screenshot({ path: `test-results/bookinger-aflys-${width(patient.page)}.png`, fullPage: true });
      await patient.page.getByRole("button", { name: "Ja, aflys tiden" }).click();
      await expect(patient.page.getByTestId("tidligere")).toContainText("Aflyst");
      await expect(patient.page.getByTestId("kommende")).toHaveCount(0);

      // Tiden er ledig igen, og patienten kan booke på ny.
      expect(await publicSlots()).toContain(booking.startsAt);
      expect((await firstSlot(patient, leadId)).startsAt).toBe(booking.startsAt);
      await patient.page.goto(`/patient/sag/${patient.caseId}`);
      await expect(patient.page.getByTestId("lead")).toContainText("Accepteret");
      await expect(patient.page.getByRole("link", { name: /Book tid/ })).toBeVisible();
      await expectNoHorizontalScroll(patient.page);

      // Klinikken ser ikke længere en aktiv booking, og kan vise de aflyste.
      await clinic.page.goto("/klinik/kalender");
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveCount(0);
      await clinic.page.getByRole("button", { name: /Vis aflyste tider/ }).click();
      await expect(clinic.page.getByTestId("kalender-booking")).toContainText("Aflyst");
      await expect(clinic.page.getByRole("button", { name: "Aflys", exact: true })).toHaveCount(0);
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("klinikken aflyser med bekræftelse, og patienten ser det", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "klinikaflys");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      await bookViaApi(patient, leadId);

      await clinic.page.goto("/klinik/kalender");
      await clinic.page.getByRole("button", { name: "Aflys", exact: true }).click();
      await expect(clinic.page.getByRole("group", { name: "Bekræft aflysning" })).toBeVisible();
      await clinic.page.getByRole("button", { name: "Fortryd" }).click();
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveAttribute("data-status", "booked");
      await clinic.page.getByRole("button", { name: "Aflys", exact: true }).click();
      await clinic.page.getByRole("button", { name: "Ja, aflys tiden" }).click();
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveCount(0);

      await patient.page.goto("/patient/bookinger");
      await expect(patient.page.getByTestId("tidligere")).toContainText("Aflyst");
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("udeblevet-knappen vises kun fra starttid og til 24 timer efter sluttid", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "udeblevet");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      const booking = await bookViaApi(patient, leadId);
      const move = (startExpr: string) =>
        sql(
          `set session_replication_role = replica; update public.bookings set starts_at = ${startExpr}, ends_at = ${startExpr} + interval '30 minutes' where id = '${booking.id}'`,
        );

      // Før starttid: ingen knap.
      await clinic.page.goto("/klinik/kalender");
      await showPastDays(clinic.page);
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveCount(1);
      await expect(clinic.page.getByRole("button", { name: "Marker udeblevet" })).toHaveCount(0);

      // En time efter starttid: i vinduet.
      move("date_trunc('hour', now()) - interval '1 hour'");
      await clinic.page.reload();
      await showPastDays(clinic.page);
      const button = clinic.page.getByRole("button", { name: "Marker udeblevet" });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(clinic.page.getByRole("button", { name: "Aflys", exact: true })).toHaveCount(0);
      await expectNoHorizontalScroll(clinic.page);
      await clinic.page.screenshot({ path: `test-results/kalender-udeblevet-${width(clinic.page)}.png`, fullPage: true });

      // Udenfor vinduet (mere end 24 timer efter sluttid): ingen knap, og besøget er gennemført.
      move("date_trunc('hour', now()) - interval '3 days'");
      await clinic.page.reload();
      await showPastDays(clinic.page);
      await expect(clinic.page.getByTestId("kalender-booking")).toContainText("Gennemført");
      await expect(clinic.page.getByRole("button", { name: "Marker udeblevet" })).toHaveCount(0);

      // Tilbage i vinduet: markér med bekræftelse.
      move("date_trunc('hour', now()) - interval '1 hour'");
      await clinic.page.reload();
      await showPastDays(clinic.page);
      await clinic.page.getByRole("button", { name: "Marker udeblevet" }).click();
      await expect(clinic.page.getByRole("group", { name: "Bekræft udeblivelse" })).toBeVisible();
      await clinic.page.getByRole("button", { name: "Ja, marker udeblevet" }).click();
      await expect(clinic.page.getByTestId("kalender-booking")).toContainText("Udeblevet");
      await expect(clinic.page.getByRole("button", { name: "Marker udeblevet" })).toHaveCount(0);

      // Patienten ser en tidligere booking uden aflysning.
      await patient.page.goto("/patient/bookinger");
      await expect(patient.page.getByTestId("tidligere")).toContainText("Udeblevet");
      await expect(patient.page.getByRole("button", { name: /^Aflys/ })).toHaveCount(0);
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("en optaget tid afvises i UI'et, og tiderne hentes igen", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "dobbelt");
    const a = await patientWithCase(browser, testInfo);
    const b = await patientWithCase(browser, testInfo);
    try {
      const leadA = await acceptedLead(a, clinic);
      const leadB = await acceptedLead(b, clinic);

      await b.page.goto(`/patient/sag/${b.caseId}/book/${leadB}`);
      const first = b.page.getByTestId("tid").first();
      await expect(first).toBeVisible();
      const chosen = (await first.innerText()).trim();
      await first.click();
      await b.page.getByLabel("Telefon").fill(PHONE);

      // Patient A når først frem til den samme tid.
      const taken = await bookViaApi(a, leadA);
      expect(taken.startsAt).toBeTruthy();

      await b.page.getByRole("button", { name: "Book tid", exact: true }).click();
      await expect(b.page.getByText(/blev lige optaget/)).toBeVisible();
      await expect(b.page.getByTestId("valgt-tid")).toHaveCount(0);
      await expect(b.page.getByTestId("tid").first()).toBeVisible();
      await expect(b.page.getByTestId("tid").first()).not.toHaveText(chosen);
      await expectNoHorizontalScroll(b.page);
      await b.page.screenshot({ path: `test-results/book-optaget-${width(b.page)}.png`, fullPage: true });

      // B vælger en anden tid og booker.
      await b.page.getByTestId("tid").first().click();
      await b.page.getByRole("button", { name: "Book tid", exact: true }).click();
      await expect(b.page.getByTestId("booking-bekraeftelse")).toBeVisible();

      // Klinikken har to bookinger i kalenderen, hver med sin kontakt.
      await clinic.page.goto("/klinik/kalender");
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveCount(2);
    } finally {
      await cleanup(a, []);
      await cleanup(b, [clinic]);
    }
  });
});
