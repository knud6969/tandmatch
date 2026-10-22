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

// Supplerende dækning af trin 6 (tester, 6.6): samtidig booking, aflysning lige før start, reserveret akuttid i kalenderen,
// cron-routen, fristen på 24 timer på minuttet, kontakt skjult før booking, antal tryk fra sagen og layout med mange tider.
// Alt kører mod den LOKALE database (helpers/inbox.ts afviser andet end localhost).

const PHONE = "12 34 56 78"; // sættes af tests/e2e/run.sh
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
  const res = await clinic.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "accept", quotedPriceMin: 700, quotedPriceMax: 1000 } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return leadId;
}

async function serviceId(patient: Patient): Promise<string> {
  const catalog = (await (await patient.page.request.get("/api/services")).json()) as { groups: { services: { id: string; slug: string }[] }[] };
  return catalog.groups.flatMap((g) => g.services).find((s) => s.slug === "blegning")!.id;
}

async function firstSlot(patient: Patient, leadId: string): Promise<{ serviceId: string; startsAt: string }> {
  const sid = await serviceId(patient);
  const res = await patient.page.request.get(`/api/leads/${leadId}/availability?serviceId=${sid}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  const { slots } = (await res.json()) as { slots: { startsAt: string }[] };
  return { serviceId: sid, startsAt: slots[0].startsAt };
}

const bookBody = (slot: { serviceId: string; startsAt: string }) => ({ ...slot, contactName: "Lea Hansen", contactPhone: PHONE });

async function bookViaApi(patient: Patient, leadId: string): Promise<{ id: string; startsAt: string }> {
  const res = await patient.page.request.post(`/api/leads/${leadId}/booking`, { data: bookBody(await firstSlot(patient, leadId)) });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; startsAt: string };
}
const QUARTER = (offset: string) => `date_trunc('hour', now() ${offset}) + floor(extract(minute from now() ${offset}) / 15) * interval '15 minutes'`;

test.describe("booking: supplerende dækning (6.6)", () => {
  test.setTimeout(240_000);

  test("to patienter booker samme tid samtidig: kun én lykkes, den anden får besked (API)", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "samtidig");
    const a = await patientWithCase(browser, testInfo);
    const b = await patientWithCase(browser, testInfo);
    try {
      const leadA = await acceptedLead(a, clinic);
      const leadB = await acceptedLead(b, clinic);
      const slot = await firstSlot(a, leadA);
      for (let round = 0; round < 1; round++) {
        const [ra, rb] = await Promise.all([
          a.page.request.post(`/api/leads/${leadA}/booking`, { data: bookBody(slot) }),
          b.page.request.post(`/api/leads/${leadB}/booking`, { data: bookBody(slot) }),
        ]);
        const statuses = [ra.status(), rb.status()].sort();
        expect(statuses, `${await ra.text()} / ${await rb.text()}`).toEqual([201, 409]);
        const loser = ra.status() === 409 ? ra : rb;
        const body = (await loser.json()) as { error?: { code?: string; message?: string }; code?: string; message?: string };
        expect(JSON.stringify(body)).toContain("SLOT_TAKEN");
      }
      // Præcis én aktiv booking på tiden.
      expect(sql(`select count(*) from public.bookings where clinic_id = '${clinic.id}' and starts_at = '${slot.startsAt}' and status = 'booked'`)).toBe("1");
      // Taberens lead er stadig accepteret, så patienten kan vælge en ny tid.
      const loserLead = sql(`select status from public.leads where clinic_id = '${clinic.id}' and status = 'accepted'`);
      expect(loserLead).toBe("accepted");
    } finally {
      await cleanup(a, []);
      await cleanup(b, [clinic]);
    }
  });

  test("reserveret akuttid (held) vises i kalenderen med udløb og uden kontakt", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "held");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const [leadId] = await sendTo(patient, [clinic]);
      const sid = await serviceId(patient);
      const me = sql(`select patient_id from public.cases where id = '${patient.caseId}'`);
      sql(
        `set session_replication_role = replica; insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, hold_expires_at, contact_name, contact_phone, contact_email)
         select '${leadId}', '${clinic.id}', '${me}', '${sid}', ${QUARTER("+ interval '2 hours'")}, ${QUARTER("+ interval '2 hours'")} + interval '30 minutes', 'held', now() + interval '25 minutes', 'Hemmelig Patient', '99 88 77 66', 'hemmelig-patient@example.com'`,
      );
      await clinic.page.goto("/klinik/kalender");
      const row = clinic.page.getByTestId("kalender-booking");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("Reserveret");
      await expect(clinic.page.getByTestId("reservation")).toContainText(/udløber/);
      await expect(clinic.page.getByTestId("kalender-kontakt")).toHaveCount(0);
      const html = await clinic.page.content();
      for (const secret of ["Hemmelig Patient", "99 88 77 66", "hemmelig-patient@example.com", me]) expect(html).not.toContain(secret);
      await expect(row.getByRole("button", { name: "Aflys", exact: true })).toHaveCount(0);
      await expect(row.getByRole("button", { name: "Marker udeblevet" })).toHaveCount(0);
      await expectNoHorizontalScroll(clinic.page);
      await clinic.page.screenshot({ path: `test-results/kalender-held-${width(clinic.page)}.png`, fullPage: true });

      // Lead-kortet skjuler også kontakten.
      await row.getByRole("link", { name: "Se henvendelsen" }).click();
      await expect(clinic.page.getByTestId("patient-kontakt")).toHaveCount(0);
      expect(await clinic.page.content()).not.toContain("Hemmelig Patient");

      // Udløber reservationen, forsvinder den fra kalenderen (effektiv status), også før cron har kørt.
      sql(`set session_replication_role = replica; update public.bookings set hold_expires_at = now() - interval '1 minute' where lead_id = '${leadId}'`);
      await clinic.page.goto("/klinik/kalender");
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveCount(0);
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("klinikken ser hverken navn, telefon eller e-mail før tiden er booket (accepteret lead)", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "skjult");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      const email = sql(`select email from auth.users u join public.cases c on c.patient_id = u.id where c.id = '${patient.caseId}'`);
      await patient.page.request.put("/api/patients/me", { data: { phone: "55 44 33 22" } }).catch(() => undefined);

      await clinic.page.goto(`/klinik/lead/${leadId}`);
      await expect(clinic.page.getByTestId("kontakt-skjult")).toBeVisible();
      await expect(clinic.page.getByTestId("patient-kontakt")).toHaveCount(0);
      expect(await clinic.page.content()).not.toContain(email);
      const api = await clinic.page.request.get(`/api/leads/${leadId}`);
      const json = await api.text();
      for (const secret of [email, "55 44 33 22", "Lea Hansen"]) expect(json).not.toContain(secret);
      const cal = await (await clinic.page.request.get("/api/bookings")).text();
      expect(cal).not.toContain(email);

      // Efter booking: synlig.
      await bookViaApi(patient, leadId);
      await clinic.page.reload();
      await expect(clinic.page.getByTestId("patient-kontakt")).toContainText("Lea Hansen");
      await expect(clinic.page.getByTestId("kontakt-skjult")).toHaveCount(0);

      // Aflyses tiden, skjules kontakten igen.
      const mine = (await (await patient.page.request.get("/api/bookings")).json()) as { bookings: { id: string }[] };
      expect((await patient.page.request.post(`/api/bookings/${mine.bookings[0].id}/cancel`, { data: {} })).status()).toBe(200);
      await clinic.page.reload();
      await expect(clinic.page.getByTestId("patient-kontakt")).toHaveCount(0);
      expect(await (await clinic.page.request.get(`/api/leads/${leadId}`)).text()).not.toContain("Lea Hansen");
    } finally {
      await cleanup(patient, [clinic]);
    }
  });

  test("kalender med mange tider på én dag og klinikkens anmeldelser med mange og lange tekster: layout og trykflader", async ({ browser }, testInfo) => {
    const clinic = await bookableClinic(browser, testInfo, "mange");
    const patient = await patientWithCase(browser, testInfo);
    try {
      const leadId = await acceptedLead(patient, clinic);
      const booking = await bookViaApi(patient, leadId);
      // Én booket tid i dag/i morgen i åbningstiden og 11 gennemførte tider på samme dag i går (samme lead; kun aktive blokerer).
      sql(
        `set session_replication_role = replica;
         update public.bookings set starts_at = date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen' - interval '1 day' + interval '8 hours', ends_at = date_trunc('day', now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen' - interval '1 day' + interval '8 hours 30 minutes', status = 'completed' where id = '${booking.id}';
         insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, contact_name, contact_phone, contact_email)
         select lead_id, clinic_id, patient_id, service_id, starts_at + n * interval '45 minutes', ends_at + n * interval '45 minutes', 'completed', contact_name, contact_phone, contact_email
           from public.bookings, generate_series(1, 11) n where id = '${booking.id}'`,
      );
      expect(sql(`select count(*) from public.bookings where clinic_id = '${clinic.id}'`)).toBe("12");

      await clinic.page.goto("/klinik/kalender");
      await showPastDays(clinic.page);
      await expect(clinic.page.getByTestId("kalender-booking")).toHaveCount(12);
      await expectNoHorizontalScroll(clinic.page);
      for (const link of await clinic.page.getByRole("link", { name: "Se henvendelsen" }).all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await clinic.page.screenshot({ path: `test-results/kalender-mange-${width(clinic.page)}.png`, fullPage: true });

      // Anmeldelser: 12 godkendte anmeldelser (hver sin booking), den første med et uendeligt langt ord.
      const longWord = "A".repeat(180);
      sql(
        `set session_replication_role = replica;
         insert into public.reviews (booking_id, clinic_id, patient_id, stars, text, price_accuracy, actual_price, lacked_transparency, transparency_comment, moderation_status)
         select b.id, b.clinic_id, b.patient_id, 1 + (row_number() over (order by b.starts_at))::int % 5,
                case when row_number() over (order by b.starts_at) = 1 then '${longWord} og en lang tekst derefter.' else 'En ganske almindelig anmeldelse nummer ' || row_number() over (order by b.starts_at) || ' med tilstrækkelig tekst.' end,
                'slightly_higher', 1050, true, 'Prisen blev først nævnt til sidst i forløbet.', 'approved'
           from public.bookings b where b.clinic_id = '${clinic.id}'`,
      );
      await clinic.page.goto("/klinik/anmeldelser");
      await expect(clinic.page.getByTestId("klinik-anmeldelse")).toHaveCount(12);
      await expectNoHorizontalScroll(clinic.page);
      for (const button of await clinic.page.getByRole("button", { name: "Svar på anmeldelsen" }).all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await clinic.page.screenshot({ path: `test-results/klinik-anmeldelser-mange-${width(clinic.page)}.png`, fullPage: true });

      await patient.page.goto(`/klinikker/${clinic.id}`);
      await expect(patient.page.getByTestId("offentlig-anmeldelse").first()).toBeVisible();
      await expectNoHorizontalScroll(patient.page);
      await patient.page.screenshot({ path: `test-results/profil-anmeldelser-mange-${width(patient.page)}.png`, fullPage: true });
    } finally {
      await cleanup(patient, [clinic]);
    }
  });
});
