import { expect, test } from "@playwright/test";
import { AppPatient } from "./helpers/app-patient";
import { cleanup, expectNoHorizontalScroll, verifiedClinic } from "./helpers/inbox";

// Notifikationsklokken i klinikkens header (platform 14.11), ved 390 og 1280 px: tal for ulæste, liste med de nyeste, tryk
// åbner leadet og markerer som læst, og "Marker alle som læst". Virker uden nøgler og uanset klinikkens e-mail- og push-valg.
test.describe("klokken på klinik-weben", () => {
  test.setTimeout(180_000);

  test("nyt lead giver tal og liste; tryk åbner leadet og markerer som læst; marker alle som læst", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "klokke");
    const patient = await AppPatient.signup();
    try {
      // Klinikken slår alle e-mail- og browservalg fra: klokken skal virke alligevel.
      const off = { emailNewLead: false, emailNewMessage: false, emailBookingChanges: false, emailBookingReminder: false, webPushNewLead: false, webPushNewMessage: false, webPushBookingChanges: false, webPushBookingReminder: false };
      expect((await x.page.request.put("/api/clinics/me/notification-settings", { data: off })).status()).toBe(200);

      await x.page.goto("/klinik");
      const bell = x.page.getByRole("button", { name: /^Notifikationer/ });
      await expect(bell).toBeVisible();
      await expect(bell).toHaveAccessibleName("Notifikationer");

      // Patienten (som appen) sender to henvendelser.
      await patient.prepareCase();
      const first = await patient.post(`/api/cases/${patient.caseId}/leads`, { clinicIds: [x.id] });
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      const leadId = first.body.leads[0].id as string;

      // Tallet kommer ved åbning (og ellers af sig selv ved polling).
      await bell.click();
      const panel = x.page.getByRole("region", { name: "Notifikationer" });
      await expect(panel.getByRole("link", { name: /Ny henvendelse på TandMatch/ })).toBeVisible();
      await expect(bell).toHaveAccessibleName("Notifikationer, 1 ulæste");
      await expect(panel.getByRole("button", { name: "Marker alle som læst" })).toBeVisible();

      // Panelet ligger helt inden for skærmen og giver ingen vandret rulning.
      const box = (await panel.boundingBox())!;
      const width = x.page.viewportSize()!.width;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      await expectNoHorizontalScroll(x.page);
      await x.page.screenshot({ path: `test-results/klokke-${width}.png` });

      // Tryk på notifikationen: åbner leadet, lukker listen og markerer som læst.
      await panel.getByRole("link", { name: /Ny henvendelse på TandMatch/ }).click();
      await expect(x.page).toHaveURL(new RegExp(`/klinik/lead/${leadId}$`));
      await expect(panel).toBeHidden();
      await expect(bell).toHaveAccessibleName("Notifikationer");

      // Ny henvendelse + "Marker alle som læst". Escape lukker listen.
      await patient.prepareCase();
      expect((await patient.post(`/api/cases/${patient.caseId}/leads`, { clinicIds: [x.id] })).status).toBe(201);
      await bell.click();
      await expect(bell).toHaveAccessibleName("Notifikationer, 1 ulæste");
      await x.page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await bell.click();
      await panel.getByRole("button", { name: "Marker alle som læst" }).click();
      await expect(bell).toHaveAccessibleName("Notifikationer");
      await expect(panel.getByRole("button", { name: "Marker alle som læst" })).toBeHidden();
      expect(await panel.getByRole("link").count()).toBe(2);
    } finally {
      await patient.deleteAccount();
      await cleanup(null, [x]);
    }
  });

  test("uden notifikationer: tom liste, og patienter og anonyme får ingen klokke i headeren", async ({ browser }, testInfo) => {
    const x = await verifiedClinic(browser, testInfo, "klokketom");
    try {
      await x.page.goto("/klinik");
      await x.page.getByRole("button", { name: /^Notifikationer/ }).click();
      await expect(x.page.getByText("Du har ingen notifikationer endnu.")).toBeVisible();
      await expectNoHorizontalScroll(x.page);
      // Forsiden for en udlogget besøgende har ingen klokke.
      await x.page.request.post("/api/auth/logout");
      await x.page.goto("/");
      await expect(x.page.getByRole("button", { name: /^Notifikationer/ })).toHaveCount(0);
    } finally {
      await cleanup(null, [x]);
    }
  });
});
