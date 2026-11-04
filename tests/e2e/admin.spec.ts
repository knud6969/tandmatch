import { expect, test } from "@playwright/test";
import { adminUser, cleanupAdmin } from "./helpers/admin";
import { PASSWORD, cleanup, expectNoHorizontalScroll, newPage, patientWithCase, sendTo, sql, verifiedClinic } from "./helpers/inbox";

// Admins sider (features/admin 6.4, arbejdsplan 11.29), ved 390 og 1280 px: admin logger ind, godkender og afviser en
// anmeldelse og sætter en klinik på pause. Patienter og klinikker sendes væk fra /admin.
const REVIEW_TEXT = "Rolig og professionel behandling, og vi fik god forklaring undervejs.";

test.describe("admin", () => {
  test.setTimeout(240_000);

  test("moderation: godkend og afvis en anmeldelse, og klinikken sættes på pause og verificeres igen", async ({ browser }, testInfo) => {
    const clinic = await verifiedClinic(browser, testInfo, "admin");
    const patient = await patientWithCase(browser, testInfo);
    const admin = await adminUser(browser, testInfo, "mod");
    try {
      // En anmeldelse (pending) af et gennemført besøg: lead, accept, booking i fortiden (lokal database), anmeldelse som appen.
      const [leadId] = await sendTo(patient, [clinic]);
      const accept = await clinic.page.request.post(`/api/leads/${leadId}/decision`, { data: { decision: "accept" } });
      expect(accept.ok(), await accept.text()).toBeTruthy();
      const bookingId = sql(
        `insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, contact_name, contact_phone, contact_email)
         select l.id, l.clinic_id, c.patient_id, (select service_id from public.case_services where case_id = c.id limit 1),
                date_trunc('hour', now()) - interval '3 days', date_trunc('hour', now()) - interval '3 days' + interval '30 minutes', 'booked',
                'Lea Hansen', '+45 12 34 56 78', 'lea@example.test'
           from public.leads l join public.cases c on c.id = l.case_id where l.id = '${leadId}' returning id`,
      ).split("\n")[0];
      const created = await patient.page.request.post("/api/reviews", {
        data: { bookingId, stars: 4, text: REVIEW_TEXT, priceAccuracy: "slightly_higher", actualPrice: 1050 },
      });
      expect(created.status(), await created.text()).toBe(201);
      const reviewId = ((await created.json()) as { id: string }).id;
      const width = admin.page.viewportSize()!.width;

      // /admin omdirigerer til moderation, og fanerne er der.
      const page = admin.page;
      await page.goto("/admin");
      await page.waitForURL((url) => url.pathname === "/admin/moderation");
      const nav = page.getByRole("navigation", { name: "Områdenavigation" });
      await expect(nav.getByRole("link")).toHaveText(["Moderation", "Klinikker"]);
      await expect(nav.getByRole("link", { name: "Moderation" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: "Moderation", level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Afventer", exact: true })).toHaveAttribute("aria-pressed", "true");

      const card = page.getByTestId("moderation-kort").filter({ hasText: clinic.name });
      await expect(card).toContainText(REVIEW_TEXT);
      await expect(card).toContainText("Faktisk pris");
      await expect(card).not.toContainText("Lea");
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/admin-moderation-${width}.png`, fullPage: true });

      // Afvis kræver en begrundelse; et hurtigvalg udfylder den.
      await card.getByRole("button", { name: "Afvis" }).click();
      await card.getByRole("button", { name: "Afvis", exact: true }).last().click();
      await expect(card.getByText("Skriv en begrundelse, når du afviser.")).toBeVisible();
      await card.getByRole("button", { name: "Personoplysninger om andre" }).click();
      await expect(card.getByLabel(/Begrundelse/)).toHaveValue("Personoplysninger om andre");
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/admin-afvis-${width}.png`, fullPage: true });
      await card.getByRole("button", { name: "Afvis", exact: true }).last().click();
      await expect(page.getByTestId("moderation-kvittering")).toContainText(`Afvist: ${clinic.name}`);
      await expect(page.getByTestId("moderation-kort").filter({ hasText: clinic.name })).toHaveCount(0);
      expect(sql(`select moderation_status || ':' || rejection_reason from public.reviews where id = '${reviewId}'`)).toBe("rejected:Personoplysninger om andre");

      // Under "Afvist" ligger den med begrundelsen og kan godkendes; først da er den offentlig.
      await page.getByRole("button", { name: "Afvist", exact: true }).click();
      const rejected = page.getByTestId("moderation-kort").filter({ hasText: clinic.name });
      await expect(rejected).toContainText("Personoplysninger om andre");
      await expect(rejected.getByRole("button", { name: "Afvis" })).toHaveCount(0);
      await rejected.getByRole("button", { name: "Godkend" }).click();
      await expect(page.getByTestId("moderation-kvittering")).toContainText(`Godkendt: ${clinic.name}`);
      const publicReviews = await (await patient.page.request.get(`/api/clinics/${clinic.id}/reviews`)).json();
      expect((publicReviews as { reviews: unknown[] }).reviews).toHaveLength(1);

      // Tom kø og fanen med klinikkers svar.
      await page.getByRole("button", { name: "Afventer", exact: true }).click();
      await expect(page.getByTestId("moderation-tom")).toHaveText("Der er intet at moderere.");
      await page.getByRole("button", { name: "Klinikkers svar" }).click();
      await expect(page.getByTestId("moderation-tom")).toBeVisible();

      // Klinikker: søg, sæt på pause (konsekvens og begrundelse), verificér igen.
      await nav.getByRole("link", { name: "Klinikker" }).click();
      await page.waitForURL((url) => url.pathname === "/admin/klinikker");
      await page.getByLabel("Søg på navn, by eller CVR").fill(clinic.name);
      const row = page.getByTestId("admin-klinik").filter({ hasText: clinic.name });
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-status", "verified");
      await expect(row.getByRole("button", { name: "Verificér" })).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `test-results/admin-klinikker-${width}.png`, fullPage: true });
      await row.getByRole("button", { name: "Sæt på pause" }).click();
      await expect(row).toContainText("Klinikken forsvinder fra oversigten og kan hverken modtage eller se henvendelser og bookinger");
      await row.getByLabel("Begrundelse (valgfri)").fill("Test af pause");
      await expectNoHorizontalScroll(page);
      await row.getByRole("button", { name: "Bekræft" }).click();
      await expect(row).toHaveAttribute("data-status", "registered");
      await expect(row).toContainText("Oprettet, afventer verificering");
      await expect(row.getByRole("button", { name: "Verificér" })).toBeVisible();
      expect(sql(`select status from public.clinics where id = '${clinic.id}'`)).toBe("registered");
      expect((await patient.page.request.get(`/api/clinics/${clinic.id}`)).status()).toBe(404);
      await row.getByRole("button", { name: "Verificér" }).click();
      await row.getByRole("button", { name: "Bekræft" }).click();
      await expect(row).toHaveAttribute("data-status", "verified");
      expect(sql(`select status from public.clinics where id = '${clinic.id}'`)).toBe("verified");
      expect(sql(`select count(*) from public.admin_actions where target_id = '${clinic.id}'`)).toBe("2");
    } finally {
      await cleanup(patient, [clinic]);
      await cleanupAdmin(admin);
    }
  });

  test("login sender admin til moderation, og patient og klinik sendes væk fra /admin", async ({ browser }, testInfo) => {
    const admin = await adminUser(browser, testInfo, "login");
    const clinic = await verifiedClinic(browser, testInfo, "adminvagt");
    const patient = await patientWithCase(browser, testInfo);
    const loginPage = await newPage(browser, testInfo);
    try {
      await loginPage.goto("/login");
      await loginPage.getByLabel("E-mail").fill(admin.email);
      await loginPage.getByLabel("Adgangskode").fill(PASSWORD);
      await loginPage.getByRole("button", { name: "Log ind" }).click();
      await loginPage.waitForURL((url) => url.pathname === "/admin/moderation");
      await expect(loginPage.getByRole("heading", { name: "Moderation", level: 1 })).toBeVisible();
      await loginPage.goto("/klinik");
      await loginPage.waitForURL((url) => url.pathname === "/admin/moderation");
      await loginPage.close();

      await clinic.page.goto("/admin/moderation");
      await clinic.page.waitForURL((url) => url.pathname === "/klinik");
      expect((await clinic.page.request.get("/api/admin/clinics")).status()).toBe(403);
      await patient.page.goto("/admin/klinikker");
      await patient.page.waitForURL((url) => url.pathname === "/");
      expect((await patient.page.request.get("/api/admin/moderation")).status()).toBe(403);

      // Uden login sendes man til /login.
      const anon = await newPage(browser, testInfo);
      await anon.goto("/admin/klinikker");
      await anon.waitForURL((url) => url.pathname === "/login");
      await anon.context().close();
    } finally {
      await cleanup(patient, [clinic]);
      await cleanupAdmin(admin);
    }
  });
});
