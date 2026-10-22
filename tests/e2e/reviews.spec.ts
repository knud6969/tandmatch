import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import {
  addListPrice,
  cleanup,
  expectNoHorizontalScroll,
  patientWithCase,
  sendTo,
  sql,
  verifiedClinic,
  type ClinicHandle,
} from "./helpers/inbox";

// Anmeldelser (arbejdsplan 6.5): patienten anmelder via API'et (patientsiderne er flyttet til appen, architecture 13.6),
// moderation sker manuelt i den LOKALE database (helpers/inbox.ts afviser andet end localhost), klinikken svarer i UI'et,
// og alt vises offentligt på klinikprofilen, når det er godkendt.

type Patient = { page: Page; caseId: string };
const REVIEW_TEXT = "Rolig og professionel behandling, og vi fik god forklaring undervejs.";
const REPLY_TEXT = "Tak for de venlige ord, vi glæder os til at se dig igen.";

const width = (page: Page) => page.viewportSize()!.width;

async function bookableClinic(browser: Browser, testInfo: TestInfo, label: string): Promise<ClinicHandle> {
  const clinic = await verifiedClinic(browser, testInfo, label);
  addListPrice(clinic.id);
  const hours = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, opensAt: "08:00", closesAt: "17:00", isEmergency: false }));
  const res = await clinic.page.request.put("/api/clinics/me/opening-hours", { data: { hours } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return clinic;
}

// Accepteret lead og booking via API. Returnerer bookingens id.
async function bookedVisit(patient: Patient, clinic: ClinicHandle): Promise<string> {
  const [leadId] = await sendTo(patient, [clinic]);
  const accept = await clinic.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "accept", quotedPriceMin: 700, quotedPriceMax: 1000 } });
  expect(accept.ok(), await accept.text()).toBeTruthy();
  const catalog = (await (await patient.page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
  const serviceId = catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning")!.id;
  const avail = await patient.page.request.get(`/api/leads/${leadId}/availability?serviceId=${serviceId}`);
  const { slots } = (await avail.json()) as { slots: { startsAt: string }[] };
  const res = await patient.page.request.post(`/api/leads/${leadId}/booking`, {
    data: { serviceId, startsAt: slots[0].startsAt, contactName: "Lea Hansen", contactPhone: "12 34 56 78" },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

function moveBooking(bookingId: string, startExpr: string) {
  sql(
    `set session_replication_role = replica; update public.bookings set starts_at = ${startExpr}, ends_at = ${startExpr} + interval '30 minutes' where id = '${bookingId}'`,
  );
}

test.describe("anmeldelser", () => {
  test.setTimeout(240_000);

  test("fra moderation til klinikkens offentlige svar", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "anmeld");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const bookingId = await bookedVisit(patient, clinic);
      moveBooking(bookingId, "date_trunc('hour', now()) - interval '3 days'");

      // Patienten anmelder besøget (som appen gør).
      const created = await patient.page.request.post("/api/reviews", {
        data: { bookingId, stars: 4, text: REVIEW_TEXT, priceAccuracy: "slightly_higher", actualPrice: 1050 },
      });
      expect(created.status(), await created.text()).toBe(201);

      // Før moderation: intet offentligt, og klinikken ser den ikke.
      await patient.page.goto(`/klinikker/${clinic.id}`);
      await expect(patient.page.getByText("Der er endnu ingen verificerede anmeldelser på TandMatch.")).toBeVisible();
      await clinic.page.goto("/klinik/anmeldelser");
      await expect(clinic.page.getByText(/ingen godkendte anmeldelser/)).toBeVisible();

      // Godkend anmeldelsen (manuel moderation, 8.5): offentlig på profilen.
      sql(`set session_replication_role = replica; update public.reviews set moderation_status = 'approved' where booking_id = '${bookingId}'`);
      await patient.page.goto(`/klinikker/${clinic.id}`);
      const pub = patient.page.getByTestId("offentlig-anmeldelse");
      await expect(pub).toContainText(REVIEW_TEXT);
      await expect(pub).toContainText("Verificeret besøg");
      await expectNoHorizontalScroll(patient.page);

      // Klinikken ser den og svarer; svaret afventer.
      await clinic.page.goto("/klinik/anmeldelser");
      const clinicReview = clinic.page.getByTestId("klinik-anmeldelse");
      await expect(clinicReview).toContainText(REVIEW_TEXT);
      await expect(clinicReview).toContainText("Nej, den endelige pris var lidt højere");
      await expectNoHorizontalScroll(clinic.page);
      await clinic.page.screenshot({ path: `test-results/klinik-anmeldelser-${width(clinic.page)}.png`, fullPage: true });
      await clinic.page.getByRole("button", { name: "Svar på anmeldelsen" }).click();
      await clinic.page.getByRole("button", { name: "Send svar" }).click();
      await expect(clinic.page.getByText("Skriv et svar.")).toBeVisible();
      await clinic.page.getByLabel("Dit offentlige svar").fill(REPLY_TEXT);
      await clinic.page.getByRole("button", { name: "Send svar" }).click();
      const mine = clinic.page.getByTestId("eget-svar");
      await expect(mine).toContainText("Afventer godkendelse");
      await expect(mine).toContainText(REPLY_TEXT);
      await expect(clinic.page.getByRole("button", { name: "Send svar" })).toHaveCount(0);

      // Det ubehandlede svar er ikke offentligt.
      await patient.page.goto(`/klinikker/${clinic.id}`);
      await expect(patient.page.getByTestId("klinik-svar")).toHaveCount(0);

      // Godkend svaret: vises offentligt og som offentliggjort hos klinikken.
      sql(`set session_replication_role = replica; update public.review_replies set moderation_status = 'approved' where review_id = (select id from public.reviews where booking_id = '${bookingId}')`);
      await patient.page.goto(`/klinikker/${clinic.id}`);
      await expect(patient.page.getByTestId("klinik-svar")).toContainText(REPLY_TEXT);
      await clinic.page.goto("/klinik/anmeldelser");
      await expect(clinic.page.getByTestId("eget-svar")).toContainText("Offentliggjort");
    } finally {
      await cleanup(patient, [clinic]);
    }
  });
});
