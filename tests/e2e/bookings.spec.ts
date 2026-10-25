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

// Klinikkens kalender (arbejdsplan 6.4): kontakt i kalender og på lead-kortet efter booking, klinikkens aflysning og
// udeblevet-knappen kun i vinduet. Patientens trin sker via API'et, fordi patientsiderne er flyttet til appen (architecture 13.6).
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

test.describe("klinikkens kalender", () => {
  test("en tid, patienten aflyser, vises dæmpet med \"Aflyst af patienten\"", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "patientaflys");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      const booked = await bookViaApi(patient, leadId);
      expect((await patient.page.request.post(`/api/bookings/${booked.id}/cancel`, { data: {} })).status()).toBe(200);
      await clinic.page.goto("/klinik/kalender");
      const row = clinic.page.getByTestId("kalender-booking");
      await expect(row).toHaveAttribute("data-status", "cancelled");
      await expect(row.getByTestId("aflyst-af")).toHaveText("Aflyst af patienten");
      await expect(row.getByTestId("kalender-kontakt")).toHaveCount(0);
      if (width(clinic.page) <= 390) await expectNoHorizontalScroll(clinic.page);
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test.setTimeout(180_000);

  test("efter en booking ser klinikken kontakten i kalenderen og på lead-kortet", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "book");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      await bookViaApi(patient, leadId);

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
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("klinikken aflyser med bekræftelse, og bookingen står som aflyst for patienten", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "klinikaflys");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      const booked = await bookViaApi(patient, leadId);

      await clinic.page.goto("/klinik/kalender");
      await clinic.page.getByRole("button", { name: "Aflys", exact: true }).click();
      await expect(clinic.page.getByRole("group", { name: "Bekræft aflysning" })).toBeVisible();
      await clinic.page.getByRole("button", { name: "Fortryd" }).click();
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveAttribute("data-status", "booked");
      await clinic.page.getByRole("button", { name: "Aflys", exact: true }).click();
      // Valgfri kort grund til patienten (højst 200 tegn).
      const reason = clinic.page.getByLabel("Kort grund til patienten (valgfri)");
      await expect(reason).toHaveAttribute("maxlength", "200");
      await reason.fill("Tandlægen er syg");
      if (width(clinic.page) <= 390) await expectNoHorizontalScroll(clinic.page);
      await clinic.page.getByRole("button", { name: "Ja, aflys tiden" }).click();
      // Den aflyste tid bliver stående dæmpet i dagslisten med hvem der aflyste og grunden (ingen vis/skjul-knap).
      const row = clinic.page.getByTestId("kalender-booking");
      await expect(row).toHaveAttribute("data-status", "cancelled");
      await expect(row.getByTestId("aflyst-af")).toHaveText("Aflyst af klinikken. Grund: Tandlægen er syg");
      await expect(clinic.page.getByRole("button", { name: /Vis aflyste tider/ })).toHaveCount(0);
      await expect(row.getByRole("button", { name: "Aflys", exact: true })).toHaveCount(0);

      // Patienten ser aflysningen og grunden i sine bookinger (API'et, som appen bruger).
      const res = await patient.page.request.get("/api/bookings");
      expect(res.ok(), await res.text()).toBeTruthy();
      const { bookings } = (await res.json()) as { bookings: { id: string; status: string; cancelledBy: string | null; cancelReason: string | null }[] };
      const mine = bookings.find((b) => b.id === booked.id);
      expect(mine?.status).toBe("cancelled");
      expect(mine?.cancelledBy).toBe("clinic");
      expect(mine?.cancelReason).toBe("Tandlægen er syg");
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

      // Patienten ser udeblivelsen i sine bookinger (API'et, som appen bruger).
      const res = await patient.page.request.get("/api/bookings");
      const { bookings } = (await res.json()) as { bookings: { id: string; status: string }[] };
      expect(bookings.find((b) => b.id === booking.id)?.status).toBe("no_show");
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

});
