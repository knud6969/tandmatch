import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import { AppPatient } from "./helpers/app-patient";
import { addListPrice, cleanup, expectNoHorizontalScroll, sql, verifiedClinic, type ClinicHandle } from "./helpers/inbox";

// Tværgående rejse (arbejdsplan 10.8): patienten agerer som appen (bearer + X-Terms-Token + X-TandMatch-Client: mobile, ingen
// cookies), klinikken sidder i Playwright på weben. Klinikker og patienter er fiktive og oprettes via API'et; verificering,
// "gennemført" og moderation sker direkte i den LOKALE database (helpers/inbox.ts afviser andet end localhost).

const PATIENT_NAME = "Lea Hansen";
const PHONE = "12 34 56 78";
const REVIEW_TEXT = "Rolig og professionel behandling, og vi fik god forklaring undervejs.";
const POLL_TIMEOUT = 30_000;

async function bookableClinic(browser: Browser, testInfo: TestInfo, label: string, emergency = false): Promise<ClinicHandle> {
  const clinic = await verifiedClinic(browser, testInfo, label);
  addListPrice(clinic.id);
  const hours = Array.from({ length: 7 }, (_, i) =>
    emergency
      ? [
          { weekday: i + 1, opensAt: "06:00", closesAt: "16:00", isEmergency: false },
          { weekday: i + 1, opensAt: "16:00", closesAt: "23:45", isEmergency: true },
        ]
      : [{ weekday: i + 1, opensAt: "08:00", closesAt: "17:00", isEmergency: false }],
  ).flat();
  const res = await clinic.page.request.put("/api/clinics/me/opening-hours", { data: { hours } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return clinic;
}

test.describe("tværgående rejse: appens patient og klinik-weben", () => {
  test.setTimeout(300_000);

  test("send, accept med kommentar, besked, book, kontakt, gennemført, anmeldelse; anden klinik ser intet", async ({ browser }, testInfo) => {
    const x = await bookableClinic(browser, testInfo, "krydsx");
    const y = await bookableClinic(browser, testInfo, "krydsy");
    const patient = await AppPatient.signup();
    try {
      // Klinikken åbner indbakken, FØR patienten sender (ingen genindlæsning bagefter).
      await x.page.goto("/klinik");
      await expect(x.page.getByTestId("ubesvarede")).toHaveText("Ingen henvendelser venter på svar");
      await y.page.goto("/klinik");
      await expect(y.page.getByTestId("ubesvarede")).toHaveText("Ingen henvendelser venter på svar");
      const title = await x.page.title();

      await patient.prepareCase();
      const sent = await patient.post(`/api/cases/${patient.caseId}/leads`, { clinicIds: [x.id] });
      expect(sent.status, JSON.stringify(sent.body)).toBe(201);
      const leadId = sent.body.leads[0].id as string;

      // Polling: leadet dukker op af sig selv inden for 30 s, med antal og i fanens titel.
      await expect(x.page.getByTestId("lead-raekke")).toHaveCount(1, { timeout: POLL_TIMEOUT });
      await expect(x.page.getByTestId("ubesvarede")).toHaveText("1 henvendelse venter på svar");
      await expect(x.page.getByTestId("lead-raekke")).toContainText("Blegning");
      await expect.poll(() => x.page.title()).toBe(`(1) ${title}`);
      await expectNoHorizontalScroll(x.page);
      // Klinik Y ser intet (efter samme ventetid som X).
      await expect(y.page.getByTestId("lead-raekke")).toHaveCount(0);
      await expect(y.page.getByTestId("ubesvarede")).toHaveText("Ingen henvendelser venter på svar");

      // Klinikken accepterer med kommentar.
      await x.page.getByTestId("lead-raekke").click();
      await x.page.getByRole("button", { name: "Accepter med kommentar", exact: true }).click();
      await x.page.getByLabel("Kommentar til patienten").fill("Vi kan klare det på én time.");
      await x.page.getByRole("button", { name: "Send og accepter" }).click();
      await expect(x.page.getByTestId("dit-svar")).toContainText("Du har accepteret henvendelsen");

      // Patienten (appen) ser accept og kommentar; klinikkens kontaktfelter er stadig skjult for klinikken.
      const leads = await patient.get(`/api/cases/${patient.caseId}/leads`);
      expect(leads.status).toBe(200);
      expect(leads.body.leads[0].status).toBe("accepted");
      expect(JSON.stringify(leads.body)).toContain("Vi kan klare det på én time.");
      await expect(x.page.getByTestId("kontakt-skjult")).toBeVisible();

      // Besked begge veje.
      await x.page.getByLabel("Skriv en besked").fill("Har du været til tandlæge det seneste år?");
      await x.page.getByRole("button", { name: "Send besked" }).click();
      await expect(x.page.getByTestId("besked")).toHaveCount(1);
      const thread = await patient.get(`/api/leads/${leadId}/messages`);
      expect(thread.status).toBe(200);
      expect(thread.body.messages).toHaveLength(1);
      expect(thread.body.messages[0]).toMatchObject({ senderRole: "clinic", fromMe: false, body: "Har du været til tandlæge det seneste år?" });
      const reply = await patient.post(`/api/leads/${leadId}/messages`, { body: "Ja, for et halvt år siden." });
      expect(reply.status, JSON.stringify(reply.body)).toBe(201);
      await expect(x.page.getByTestId("besked")).toHaveCount(2, { timeout: POLL_TIMEOUT });
      await expect(x.page.getByTestId("besked").nth(1)).toContainText("Ja, for et halvt år siden.");

      // Booking som appen: ledige tider, derefter booking med navn og telefon.
      const serviceId = await patient.serviceId("blegning");
      const avail = await patient.get(`/api/leads/${leadId}/availability?serviceId=${serviceId}`);
      expect(avail.status, JSON.stringify(avail.body)).toBe(200);
      const slot = avail.body.slots[0].startsAt as string;
      const booked = await patient.post(`/api/leads/${leadId}/booking`, { serviceId, startsAt: slot, contactName: PATIENT_NAME, contactPhone: PHONE });
      expect(booked.status, JSON.stringify(booked.body)).toBe(201);
      // Samme tid kan ikke bookes igen.
      const again = await patient.post(`/api/leads/${leadId}/booking`, { serviceId, startsAt: slot, contactName: PATIENT_NAME, contactPhone: PHONE });
      expect(again.status).toBeGreaterThanOrEqual(400);

      // Klinikken ser bookingen med navn og telefon i kalenderen (uden at kunne se den før).
      await x.page.goto("/klinik/kalender");
      const booking = x.page.getByTestId("kalender-booking");
      await expect(booking).toHaveCount(1);
      await expect(booking).toContainText("Booket");
      await expect(x.page.getByTestId("kalender-kontakt")).toContainText(PATIENT_NAME);
      await expect(x.page.getByTestId("kalender-kontakt")).toContainText(PHONE);
      await expectNoHorizontalScroll(x.page);
      // Klinik Y: tom kalender og intet på X's lead (UI og API).
      await y.page.goto("/klinik/kalender");
      await expect(y.page.getByTestId("kalender-booking")).toHaveCount(0);
      expect((await y.page.request.get(`/api/leads/${leadId}`)).status()).toBe(404);
      expect([403, 404]).toContain((await y.page.request.get(`/api/leads/${leadId}/messages`)).status());
      expect(((await (await y.page.request.get("/api/leads")).json()) as { leads: unknown[] }).leads).toHaveLength(0);
      expect(((await (await y.page.request.get("/api/bookings")).json().catch(() => ({ bookings: [] }))) as { bookings?: unknown[] }).bookings ?? []).toHaveLength(0);

      // Anmeldelse før gennemført besøg afvises.
      const tooEarly = await patient.post("/api/reviews", { bookingId: booked.body.id, stars: 5, text: REVIEW_TEXT, priceAccuracy: "yes" });
      expect(tooEarly.status).toBeGreaterThanOrEqual(400);

      // Besøget er gennemført (tiden flyttes til fortiden i den lokale database).
      sql(
        `set session_replication_role = replica; update public.bookings set starts_at = date_trunc('hour', now()) - interval '3 days', ends_at = date_trunc('hour', now()) - interval '3 days' + interval '30 minutes' where id = '${booked.body.id}'`,
      );
      const eligible = await patient.get("/api/reviews/eligible");
      expect(eligible.status, JSON.stringify(eligible.body)).toBe(200);
      expect(eligible.body.items.map((i: { bookingId?: string; id?: string }) => i.bookingId ?? i.id)).toContain(booked.body.id);
      const review = await patient.post("/api/reviews", { bookingId: booked.body.id, stars: 4, text: REVIEW_TEXT, priceAccuracy: "slightly_higher", actualPrice: 1050 });
      expect(review.status, JSON.stringify(review.body)).toBe(201);
      expect(review.body.moderationStatus ?? review.body.status).toBe("pending");

      // Før moderation: intet hos klinikken. Efter: klinikken ser den, og den er offentlig; Y ser den ikke.
      await x.page.goto("/klinik/anmeldelser");
      await expect(x.page.getByText(/ingen godkendte anmeldelser/)).toBeVisible();
      sql(`set session_replication_role = replica; update public.reviews set moderation_status = 'approved' where booking_id = '${booked.body.id}'`);
      await x.page.reload();
      await expect(x.page.getByTestId("klinik-anmeldelse")).toContainText(REVIEW_TEXT);
      await expect(x.page.getByTestId("klinik-anmeldelse")).toContainText("lidt højere");
      await y.page.goto("/klinik/anmeldelser");
      await expect(y.page.getByTestId("klinik-anmeldelse")).toHaveCount(0);
      await x.page.goto(`/klinikker/${x.id}`);
      await expect(x.page.getByTestId("offentlig-anmeldelse")).toContainText(REVIEW_TEXT);
    } finally {
      await patient.deleteAccount();
      await cleanup(null, [x, y]);
    }
  });

  test("akut-lead fra appen ligger øverst i indbakken, og et tilbagetrukket lead vises som Trukket tilbage", async ({ browser }, testInfo) => {
    const x = await bookableClinic(browser, testInfo, "krydsakut", true);
    const first = await AppPatient.signup("Mads");
    const emergency = await AppPatient.signup("Lea");
    try {
      // Et almindeligt lead sendes først; det trækkes tilbage senere.
      await first.prepareCase();
      const normal = await first.post(`/api/cases/${first.caseId}/leads`, { clinicIds: [x.id] });
      expect(normal.status, JSON.stringify(normal.body)).toBe(201);
      const normalLeadId = normal.body.leads[0].id as string;

      await x.page.goto("/klinik");
      await expect(x.page.getByTestId("lead-raekke")).toHaveCount(1);
      await expect(x.page.getByTestId("ubesvarede")).toHaveText("1 henvendelse venter på svar");

      // Appens akutvej: ledige tider og ét kald, der opretter sag, lead og reservation. Samtykke først.
      const consent = await emergency.post("/api/consents", { type: "health_data_sharing", textVersion: "health_data_sharing@v1-klinikker" });
      expect(consent.status, JSON.stringify(consent.body)).toBe(201);
      const all = (await emergency.get("/api/services")).body.groups.flatMap((g: { services: { id: string; category: string }[] }) => g.services);
      const serviceId = all.find((s: { category: string }) => s.category === "emergency").id as string;
      const avail = await emergency.get(`/api/clinics/${x.id}/availability?serviceId=${serviceId}`);
      expect(avail.status, JSON.stringify(avail.body)).toBe(200);
      const slot = avail.body.slots[0].startsAt as string;
      const sent = await emergency.post("/api/emergency-leads", {
        clinicId: x.id,
        serviceId,
        startsAt: slot,
        description: "Jeg har ondt i en kindtand og kan ikke sove.",
        contactName: PATIENT_NAME,
        contactPhone: PHONE,
        postalCode: "2100",
      });
      expect(sent.status, JSON.stringify(sent.body)).toBe(201);

      // Uden genindlæsning: to ubesvarede, og akut-leadet står øverst (akut før nyeste).
      await expect(x.page.getByTestId("lead-raekke")).toHaveCount(2, { timeout: POLL_TIMEOUT });
      await expect(x.page.getByTestId("ubesvarede")).toHaveText("2 henvendelser venter på svar");
      await expect(x.page.getByTestId("lead-raekke").first()).toContainText("Akut");
      await expect(x.page.getByTestId("lead-raekke").last()).not.toContainText("Akut");
      await expectNoHorizontalScroll(x.page);
      // Klinikken ser hverken navn eller telefon, før tiden er booket.
      expect(await x.page.locator("main").innerText()).not.toContain(PATIENT_NAME);

      // Reservationen ses i kalenderen uden kontaktoplysninger.
      await x.page.goto("/klinik/kalender");
      await expect(x.page.getByTestId("reservation")).toBeVisible();
      await expect(x.page.getByTestId("kalender-kontakt")).toHaveCount(0);

      // Det almindelige lead trækkes tilbage fra appen; klinikken ser "Trukket tilbage" efter næste opdatering.
      await x.page.goto("/klinik");
      await expect(x.page.getByTestId("lead-raekke")).toHaveCount(2);
      const withdrawn = await first.post(`/api/leads/${normalLeadId}/withdraw`, {});
      expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBeLessThan(300);
      await expect(x.page.getByTestId("ubesvarede")).toHaveText("1 henvendelse venter på svar", { timeout: POLL_TIMEOUT });
      await x.page.getByRole("button", { name: /^Trukket tilbage/ }).click();
      const row = x.page.getByTestId("lead-raekke");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("Patienten har trukket henvendelsen tilbage");
      await expect(row).not.toContainText("Blegning");
      await expectNoHorizontalScroll(x.page);
    } finally {
      await first.deleteAccount();
      await emergency.deleteAccount();
      await cleanup(null, [x]);
    }
  });
});
