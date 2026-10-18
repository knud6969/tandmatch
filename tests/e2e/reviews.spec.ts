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

// Anmeldelser (arbejdsplan 6.5): patienten anmelder efter fristen, moderation sker manuelt i den LOKALE database
// (helpers/inbox.ts afviser andet end localhost), klinikken svarer, og alt vises offentligt, når det er godkendt.

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

  test("fra anmeldelse og moderation til offentligt svar", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "anmeld");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const bookingId = await bookedVisit(patient, clinic);
      moveBooking(bookingId, "date_trunc('hour', now()) - interval '3 days'");

      // Bookingen har "Skriv anmeldelse"; anmeldelsessiden viser besøget uden egne anmeldelser.
      await patient.page.goto("/patient/bookinger");
      const link = patient.page.getByTestId("tidligere").getByRole("link", { name: /Skriv anmeldelse/ });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/anmeld-bookinger-${width(patient.page)}.png`, fullPage: true });

      await patient.page.goto("/patient/anmeldelser");
      await expect(patient.page.getByRole("heading", { level: 1 })).toHaveText("Mine anmeldelser");
      await expect(patient.page.getByTestId("kan-anmeldes")).toContainText(clinic.name);
      await expect(patient.page.getByText("Du har ikke skrevet nogen anmeldelser endnu.")).toBeVisible();
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/anmeldelser-tom-${width(patient.page)}.png`, fullPage: true });
      await patient.page.getByRole("link", { name: /Skriv anmeldelse/ }).click();
      await expect(patient.page).toHaveURL(new RegExp(`/patient/anmeld/${bookingId}$`));

      // Formularen: prisoverslag, moderationstekst, stjerner på mindst 44 px.
      await expect(patient.page.getByTestId("prisoverslag")).toContainText("700–1.000 kr.");
      await expect(patient.page.getByText("Anmeldelsen modereres")).toBeVisible();
      for (const n of [1, 2, 3, 4, 5]) {
        const star = patient.page.getByRole("radio", { name: n === 1 ? "1 stjerne" : `${n} stjerner` });
        const box = (await star.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/anmeld-formular-${width(patient.page)}.png`, fullPage: true });

      // Tom indsendelse giver fejl på dansk; intet sendes.
      await patient.page.getByRole("button", { name: "Send anmeldelse" }).click();
      await expect(patient.page.getByText("Vælg, hvor mange stjerner du giver.")).toBeVisible();
      await expect(patient.page.getByText("Vælg, om prisen svarede til prisoverslaget.")).toBeVisible();
      await expect(patient.page.getByText(/Skriv mindst 20 tegn/).last()).toBeVisible();
      await patient.page.screenshot({ path: `test-results/anmeld-fejl-${width(patient.page)}.png`, fullPage: true });

      // Tastatur: pil til højre vælger næste stjerne.
      await patient.page.getByRole("radio", { name: "4 stjerner" }).focus();
      await patient.page.keyboard.press("ArrowRight");
      await expect(patient.page.getByRole("radio", { name: "5 stjerner" })).toBeChecked();

      await patient.page.getByLabel("Din anmeldelse").fill(REVIEW_TEXT);
      await expect(patient.page.getByTestId("tegntaeller")).toContainText(`${REVIEW_TEXT.length} af 2000`);
      await patient.page.getByLabel("Nej, den endelige pris var lidt højere").check();
      await patient.page.getByLabel("Den faktiske pris (valgfri)").fill("1.050");
      await patient.page.getByLabel("Ja, der manglede gennemsigtighed").check();
      await patient.page.getByLabel("Hvad manglede? (valgfri)").fill("Prisen blev først nævnt til sidst.");
      await patient.page.getByRole("button", { name: "Send anmeldelse" }).click();
      await expect(patient.page.getByTestId("anmeldelse-kvittering")).toContainText("afventer godkendelse");
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/anmeld-kvittering-${width(patient.page)}.png`, fullPage: true });

      // Formularen kan ikke bruges to gange.
      await patient.page.goto(`/patient/anmeld/${bookingId}`);
      await expect(patient.page.getByTestId("anmeld-ikke-mulig")).toContainText("Dette besøg kan ikke anmeldes");
      await patient.page.goto("/patient/bookinger");
      await expect(patient.page.getByRole("link", { name: /Skriv anmeldelse/ })).toHaveCount(0);

      // Mine anmeldelser: afventer; intet offentligt endnu.
      await patient.page.goto("/patient/anmeldelser");
      const own = patient.page.getByTestId("min-anmeldelse");
      await expect(own).toContainText("Afventer godkendelse");
      await expect(own).toContainText(REVIEW_TEXT);
      await expect(own).toContainText("1.050 kr.");
      await expect(patient.page.getByTestId("kan-anmeldes")).toHaveCount(0);
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/anmeldelser-afventer-${width(patient.page)}.png`, fullPage: true });
      await patient.page.goto(`/klinikker/${clinic.id}`);
      await expect(patient.page.getByText("Der er endnu ingen verificerede anmeldelser på TandMatch.")).toBeVisible();

      // Klinikken ser ikke anmeldelsen, før den er godkendt.
      await clinic.page.goto("/klinik/anmeldelser");
      await expect(clinic.page.getByText(/ingen godkendte anmeldelser/)).toBeVisible();

      // Godkend anmeldelsen (manuel moderation, 8.5).
      sql(`set session_replication_role = replica; update public.reviews set moderation_status = 'approved' where booking_id = '${bookingId}'`);
      await patient.page.goto("/patient/anmeldelser");
      await expect(patient.page.getByTestId("min-anmeldelse")).toContainText("Offentliggjort");
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
      await clinic.page.getByRole("button", { name: "Send svar" }).click();
      await expect(clinic.page.getByText("Skriv et svar.")).toBeVisible();
      await clinic.page.getByLabel("Dit offentlige svar").fill(REPLY_TEXT);
      await clinic.page.getByRole("button", { name: "Send svar" }).click();
      const mine = clinic.page.getByTestId("eget-svar");
      await expect(mine).toContainText("Afventer godkendelse");
      await expect(mine).toContainText(REPLY_TEXT);
      await expect(clinic.page.getByRole("button", { name: "Send svar" })).toHaveCount(0);
      await expectNoHorizontalScroll(clinic.page);
      await clinic.page.screenshot({ path: `test-results/klinik-svar-afventer-${width(clinic.page)}.png`, fullPage: true });

      // Det ubehandlede svar er ikke offentligt og ikke synligt for patienten.
      await patient.page.goto(`/klinikker/${clinic.id}`);
      await expect(patient.page.getByTestId("offentlig-anmeldelse")).toContainText(REVIEW_TEXT);
      await expect(patient.page.getByTestId("klinik-svar")).toHaveCount(0);

      // Godkend svaret: vises offentligt, hos patienten og som offentliggjort hos klinikken.
      sql(`set session_replication_role = replica; update public.review_replies set moderation_status = 'approved' where review_id = (select id from public.reviews where booking_id = '${bookingId}')`);
      await patient.page.goto(`/klinikker/${clinic.id}`);
      await expect(patient.page.getByTestId("klinik-svar")).toContainText(REPLY_TEXT);
      await patient.page.goto("/patient/anmeldelser");
      await expect(patient.page.getByTestId("klinik-svar")).toContainText(REPLY_TEXT);
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/anmeldelser-svar-${width(patient.page)}.png`, fullPage: true });
      await clinic.page.goto("/klinik/anmeldelser");
      await expect(clinic.page.getByTestId("eget-svar")).toContainText("Offentliggjort");
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("afvist anmeldelse viser begrundelsen", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "afvist");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const bookingId = await bookedVisit(patient, clinic);
      moveBooking(bookingId, "date_trunc('hour', now()) - interval '3 days'");
      const res = await patient.page.request.post("/api/reviews", {
        data: { bookingId, stars: 2, text: "Det var ikke som forventet, og ventetiden var lang.", priceAccuracy: "much_higher" },
      });
      expect(res.status(), await res.text()).toBe(201);
      sql(`set session_replication_role = replica; update public.reviews set moderation_status = 'rejected', rejection_reason = 'Indeholder personoplysninger om andre.' where booking_id = '${bookingId}'`);
      await patient.page.goto("/patient/anmeldelser");
      await expect(patient.page.getByTestId("min-anmeldelse")).toContainText("Afvist");
      await expect(patient.page.getByTestId("afvist-begrundelse")).toContainText("Indeholder personoplysninger om andre.");
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/anmeldelser-afvist-${width(patient.page)}.png`, fullPage: true });
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("før fristen og efter udeblivelse kan der ikke anmeldes", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "frist");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const bookingId = await bookedVisit(patient, clinic);

      // Besøget er slut for to timer siden, men fristen på 24 timer er ikke udløbet: ingen knap, venlig besked.
      moveBooking(bookingId, "date_trunc('hour', now()) - interval '3 hours'");
      await patient.page.goto("/patient/bookinger");
      await expect(patient.page.getByTestId("tidligere")).toContainText(clinic.name);
      await expect(patient.page.getByRole("link", { name: /Skriv anmeldelse/ })).toHaveCount(0);
      await patient.page.goto(`/patient/anmeld/${bookingId}`);
      await expect(patient.page.getByTestId("anmeld-ikke-mulig")).toContainText("Dette besøg kan ikke anmeldes");
      await expect(patient.page.getByRole("link", { name: "Til mine anmeldelser" })).toBeVisible();
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/anmeld-ikke-mulig-${width(patient.page)}.png`, fullPage: true });
      const early = await patient.page.request.post("/api/reviews", {
        data: { bookingId, stars: 5, text: "Alt for tidligt til at skrive en anmeldelse.", priceAccuracy: "as_quoted" },
      });
      expect(early.status()).toBe(403);

      // Ukendt booking-id giver samme venlige besked.
      await patient.page.goto("/patient/anmeld/00000000-0000-4000-8000-000000000000");
      await expect(patient.page.getByTestId("anmeld-ikke-mulig")).toBeVisible();

      // Klinikken markerer udeblevet i vinduet: der kan aldrig anmeldes, heller ikke efter fristen.
      const noShow = await clinic.page.request.post(`/api/bookings/${bookingId}/no-show`, { data: {} });
      expect(noShow.ok(), await noShow.text()).toBeTruthy();
      moveBooking(bookingId, "date_trunc('hour', now()) - interval '3 days'");
      await patient.page.goto("/patient/bookinger");
      await expect(patient.page.getByTestId("tidligere")).toContainText("Udeblevet");
      await expect(patient.page.getByRole("link", { name: /Skriv anmeldelse/ })).toHaveCount(0);
      await patient.page.goto(`/patient/anmeld/${bookingId}`);
      await expect(patient.page.getByTestId("anmeld-ikke-mulig")).toBeVisible();
      const blocked = await patient.page.request.post("/api/reviews", {
        data: { bookingId, stars: 5, text: "Jeg var der ikke, men skriver alligevel.", priceAccuracy: "as_quoted" },
      });
      expect(blocked.status()).toBe(403);
    } finally {
      await cleanup(patient, [clinic]);
    }
  });
});
