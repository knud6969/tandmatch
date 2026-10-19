import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { CONSENT_TEXT_VERSIONS } from "../../lib/constants/consents";
import {
  addListPrice,
  cleanup,
  expectNoHorizontalScroll,
  newPage,
  PASSWORD,
  patientWithCase,
  sendTo,
  sql,
  verifiedClinic,
  type ClinicHandle,
} from "./helpers/inbox";

// Akut-rejsen fra ende til anden (arbejdsplan 7.10): patient (forside -> "Jeg har ondt" -> klinik med akuttid -> tid -> konto ->
// samtykke -> send) og klinik (anden browserkontekst: akut-lead øverst uden navn og telefon -> accepter -> nu navn og telefon).
// Desuden: en anden patient kan ikke vælge den reserverede tid, og en afvisning frigiver den.
// Klinikken oprettes af testen (egen akutvindue og pris, så vi kender dens login). Kører mod den LOKALE database med demodata.

const NAME = "Mette Hansen";
const PHONE = "12 34 56 78";
const width = (page: Page) => page.viewportSize()!.width;
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/${name}-${width(page)}.png`, fullPage: true });

type Slot = { startsAt: string };

async function emergencyClinic(browser: Browser, testInfo: TestInfo): Promise<ClinicHandle> {
  const clinic = await verifiedClinic(browser, testInfo, "akutrejse");
  addListPrice(clinic.id); // blegning, til det almindelige lead
  sql(
    `set session_replication_role = replica; insert into public.clinic_prices (clinic_id, service_id, price_min, price_max, duration_min) select '${clinic.id}', id, 600, 900, 30 from public.services where slug = 'akut_konsultation'`,
  );
  // Akutvindue alle ugens dage, så der altid er ledige akuttider inden for de nærmeste dage.
  const hours = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, opensAt: "07:00", closesAt: "22:00", isEmergency: true }));
  const res = await clinic.page.request.put("/api/clinics/me/opening-hours", { data: { hours } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return clinic;
}

async function emergencyServiceId(page: Page): Promise<string> {
  const catalog = (await (await page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
  return catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "akut_konsultation")!.id;
}

async function availability(page: Page, clinicId: string, serviceId: string): Promise<string[]> {
  const res = await page.request.get(`/api/clinics/${clinicId}/availability?serviceId=${serviceId}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { slots: Slot[] }).slots.map((s) => s.startsAt);
}

// En anden patient (konto + samtykke via API) sender en akutanmodning; returnerer svaret.
async function secondPatient(browser: Browser, testInfo: TestInfo) {
  const page = await newPage(browser, testInfo);
  const signup = await page.request.post("/api/auth/signup", {
    data: { role: "patient", email: `e2e-akutrejse-b-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`, password: PASSWORD, firstName: "Bo" },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const consent = await page.request.post("/api/consents", { data: { type: "health_data_sharing", textVersion: CONSENT_TEXT_VERSIONS.health_data_sharing } });
  expect(consent.status(), await consent.text()).toBe(201);
  return page;
}

function emergencyBody(clinicId: string, serviceId: string, startsAt: string) {
  return { clinicId, serviceId, startsAt, description: "Jeg har kraftig tandpine og kan ikke sove.", contactName: "Bo Jensen", contactPhone: "87 65 43 21" };
}

test.describe("akut-rejsen fra ende til anden (7.10)", () => {
  test.setTimeout(240_000);

  test("fra forsiden til booket akuttid, og klinikken ser kontakten først efter accept", async ({ browser }, testInfo) => {
    const clinic = await emergencyClinic(browser, testInfo);
    const patient = await newPage(browser, testInfo);
    const other = await secondPatient(browser, testInfo);
    const normal = await patientWithCase(browser, testInfo);
    try {
      const serviceId = await emergencyServiceId(patient);

      // --- Patienten: forsiden -> /akut -> klinik -> tid ---
      await patient.goto("/");
      await patient.getByRole("link", { name: "Jeg har ondt" }).click();
      await expect(patient).toHaveURL(/\/akut$/);
      await expect(patient.getByTestId("akut-blok")).toContainText("112");
      const list = patient.getByTestId("akut-klinikliste");
      await expect(list).toBeVisible();
      await expect(patient.getByText(/Sorteret efter første ledige akuttid/)).toBeVisible();
      await patient.getByRole("button", { name: `Vælg tid hos ${clinic.name}` }).click();
      await expect(patient.getByTestId("akut-tider")).toContainText(clinic.name);
      await patient.getByTestId("tid").first().click();
      await expect(patient.getByTestId("akut-valgt")).toBeVisible();
      await expectNoHorizontalScroll(patient);

      // --- Konto og samtykke ---
      await patient.getByLabel("Fornavn").fill("Mette");
      await patient.getByLabel("E-mail").fill(`e2e-akutrejse-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
      await patient.getByLabel("Adgangskode").fill(PASSWORD);
      await patient.getByRole("button", { name: "Opret patientkonto" }).click();
      const gate = patient.getByTestId("samtykke-health_data_sharing");
      await expect(gate).toBeVisible();
      await patient.getByLabel("Jeg giver mit samtykke").check();
      await patient.getByRole("button", { name: "Giv samtykke", exact: true }).click();
      await expect(patient.getByTestId("akut-send")).toBeVisible();

      // --- Send ---
      await patient.getByLabel("Hvad er der galt?").fill("Jeg har haft kraftig tandpine siden i nat.");
      await patient.getByLabel("Fulde navn").fill(NAME);
      await patient.getByLabel("Telefon").fill(PHONE);
      await expectNoHorizontalScroll(patient);
      await patient.getByRole("button", { name: "Send og reservér tiden" }).click();
      await expect(patient.getByTestId("akut-sendt")).toContainText("Tiden er reserveret til dig");
      await shot(patient, "akutrejse-patient-sendt");
      const caseLink = patient.getByRole("link", { name: "Se din sag" });
      const caseHref = (await caseLink.getAttribute("href"))!;
      expect(caseHref).toMatch(/\/patient\/sag\/[0-9a-f-]{36}$/);

      // Den reserverede tid (fra databasen, så testen ikke afhænger af klokkeslættet).
      const held = sql(`select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from public.bookings where clinic_id = '${clinic.id}' and status = 'held'`);
      expect(held).not.toBe("");
      const heldIso = new Date(held).toISOString();

      // --- En anden patient kan ikke vælge den reserverede tid ---
      const slotsNow = await availability(other, clinic.id, serviceId);
      expect(slotsNow.map((s) => new Date(s).toISOString())).not.toContain(heldIso);
      const clash = await other.request.post("/api/emergency-leads", { data: emergencyBody(clinic.id, serviceId, heldIso) });
      expect(clash.status(), await clash.text()).toBe(409);
      const clashText = await clash.text();
      expect(clashText, `${heldIso} ${clashText}`).toContain("SLOT_TAKEN");

      // Et almindeligt lead sendes bagefter, så det er nyest; akut-leadet skal alligevel stå øverst.
      await sendTo(normal, [clinic]);

      // --- Klinikken: akut-leadet øverst, uden navn og telefon ---
      await clinic.page.goto("/klinik");
      const rows = clinic.page.getByTestId("lead-raekke");
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText("Akut");
      await expect(rows.last()).not.toContainText("Akut");
      await expect(clinic.page.locator("main")).not.toContainText("Mette");
      await expect(clinic.page.locator("main")).not.toContainText("12 34");
      await shot(clinic.page, "akutrejse-klinik-indbakke");
      await rows.first().click();
      await expect(clinic.page.getByTestId("kontakt-skjult")).toBeVisible();
      await expect(clinic.page.getByTestId("patient-kontakt")).toHaveCount(0);
      await expect(clinic.page.locator("main")).not.toContainText(NAME);
      await expect(clinic.page.locator("main")).not.toContainText("12345678");
      await expect(clinic.page.locator("main")).not.toContainText(PHONE);
      await expect(clinic.page.getByText("Tiden bliver booket, når du accepterer")).toBeVisible();
      await expectNoHorizontalScroll(clinic.page);
      await shot(clinic.page, "akutrejse-klinik-lead-for-accept");

      // --- Accepter ---
      await clinic.page.getByRole("button", { name: "Accepter", exact: true }).click();
      await expect(clinic.page.getByTestId("patient-kontakt")).toBeVisible();
      await expect(clinic.page.getByTestId("patient-kontakt")).toContainText(NAME);
      await expect(clinic.page.getByTestId("patient-kontakt")).toContainText(PHONE);
      await expect(clinic.page.getByTestId("kontakt-skjult")).toHaveCount(0);
      await expectNoHorizontalScroll(clinic.page);
      await shot(clinic.page, "akutrejse-klinik-lead-efter-accept");

      // --- Patienten: bookingen på sagen og i /patient/bookinger ---
      await patient.goto(caseHref);
      const lead = patient.getByTestId("lead");
      await expect(lead).toContainText("Booket");
      await expect(lead.getByTestId("booking-tid")).toBeVisible();
      await expectNoHorizontalScroll(patient);
      await shot(patient, "akutrejse-patient-sag");
      await patient.goto("/patient/bookinger");
      await expect(patient.getByTestId("kommende")).toContainText(clinic.name);
      await expectNoHorizontalScroll(patient);
      await shot(patient, "akutrejse-patient-bookinger");

      // Klinikkens kalender har samme tid, og tiden er stadig optaget for andre.
      expect(sql(`select count(*) from public.bookings where clinic_id = '${clinic.id}' and status = 'booked' and starts_at = '${heldIso}'`)).toBe("1");
      const after = await other.request.post("/api/emergency-leads", { data: emergencyBody(clinic.id, serviceId, heldIso) });
      expect(after.status(), await after.text()).toBe(409);
    } finally {
      await cleanup(normal, []);
      await cleanup({ page: other }, []);
      await cleanup({ page: patient }, [clinic]);
    }
  });

  test("en afvisning frigiver den reserverede akuttid", async ({ browser }, testInfo) => {
    const clinic = await emergencyClinic(browser, testInfo);
    const a = await secondPatient(browser, testInfo);
    const b = await secondPatient(browser, testInfo);
    try {
      const serviceId = await emergencyServiceId(a);
      const slot = new Date((await availability(a, clinic.id, serviceId))[0]).toISOString();
      const sent = await a.request.post("/api/emergency-leads", { data: emergencyBody(clinic.id, serviceId, slot) });
      expect(sent.status(), await sent.text()).toBe(201);

      // Reserveret: ikke blandt de ledige tider, og en anden patient får 409.
      expect((await availability(b, clinic.id, serviceId)).map((s) => new Date(s).toISOString())).not.toContain(slot);
      const clash = await b.request.post("/api/emergency-leads", { data: emergencyBody(clinic.id, serviceId, slot) });
      expect(clash.status(), await clash.text()).toBe(409);

      // Klinikken afviser i UI'et.
      await clinic.page.goto("/klinik");
      const rows = clinic.page.getByTestId("lead-raekke");
      await expect(rows).toHaveCount(1);
      await rows.first().click();
      await clinic.page.getByRole("button", { name: "Afvis", exact: true }).click();
      await clinic.page.getByRole("button", { name: "Send afvisning" }).click();
      await expect(clinic.page.getByTestId("dit-svar")).toContainText("Du har afvist henvendelsen");
      await shot(clinic.page, "akutrejse-klinik-afvist");

      // Frigivet: tiden er ledig igen, og den anden patient kan reservere den.
      expect(sql(`select count(*) from public.bookings where clinic_id = '${clinic.id}' and status in ('held', 'booked')`)).toBe("0");
      expect((await availability(b, clinic.id, serviceId)).map((s) => new Date(s).toISOString())).toContain(slot);
      const retry = await b.request.post("/api/emergency-leads", { data: emergencyBody(clinic.id, serviceId, slot) });
      expect(retry.status(), await retry.text()).toBe(201);
    } finally {
      await cleanup({ page: a }, []);
      await cleanup({ page: b }, [clinic]);
    }
  });
});
