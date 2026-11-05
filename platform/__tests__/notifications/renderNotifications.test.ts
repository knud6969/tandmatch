import { describe, expect, it } from "vitest";
import { CLINIC_NOTIFICATION_TYPES, PATIENT_NOTIFICATION_TYPES } from "@/lib/common/constants/notifications";
import {
  clinicNotificationPath,
  escapeHtml,
  isAllowedClinicNotificationPath,
  isAllowedNotificationPath,
  parseNotificationPayload,
  patientNotificationPath,
  renderClinicEmail,
  renderClinicWebPush,
  renderPatientPush,
} from "@/lib/common/domain/notifications";
import { isAllowedWebPushEndpoint } from "@/lib/clinics/domain/web-push";
import { registerWebPushSchema } from "@/lib/clinics/schemas/web-push";
import { notificationSettingsSchema } from "@/lib/clinics/schemas/notification-settings";
import { registerPushTokenSchema } from "@/lib/identity/schemas/push-tokens";

const CASE = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const payload = {
  caseId: CASE,
  leadId: LEAD,
  bookingId: BOOKING,
  startsAt: "2026-11-10T08:15:00Z", // 09.15 dansk tid
  previousStartsAt: "2026-11-09T12:00:00Z", // 13.00
  holdExpiresAt: "2026-11-05T15:30:00Z", // 16.30
};
// Felter, der aldrig må ende i en notifikation, hvis nogen sneg dem ind.
const poisoned = { ...payload, name: "Alma Hansen", summary: "Hul i kindtand", body: "Hemmelig besked", phone: "+45 12345678" };
const SECRETS = ["Alma", "Hansen", "kindtand", "Hemmelig", "12345678"];

describe("renderClinicEmail", () => {
  for (const type of CLINIC_NOTIFICATION_TYPES) {
    it(`${type}: ingen pladsholdere og kun faste tekster, tider og links`, () => {
      const mail = renderClinicEmail(type, payload as never, "https://tandmatch.dk");
      for (const part of [mail.subject, mail.text, mail.html]) {
        expect(part).not.toMatch(/\{|\}|undefined|null|NaN/);
      }
      expect(mail.text).toContain(`https://tandmatch.dk/klinik/lead/${LEAD}`);
      expect(mail.text).toContain("https://tandmatch.dk/klinik/profil#notifikationer");
      expect(mail.text).toContain("Svar ikke på denne e-mail.");
      expect(mail.html).toContain("<a href=");
      expect(mail.html).not.toMatch(/<img|<script|src=/);
    });
    it(`${type}: får aldrig navn, opsummering eller beskedtekst med`, () => {
      const mail = renderClinicEmail(type, poisoned as never, "https://tandmatch.dk");
      for (const secret of SECRETS) {
        expect(mail.subject + mail.text + mail.html).not.toContain(secret);
      }
    });
  }

  it("viser tidspunkter i dansk tid", () => {
    const created = renderClinicEmail("clinic_booking_created", payload, "https://tandmatch.dk");
    expect(created.text).toContain("tirsdag 10. november kl. 09.15");
    const moved = renderClinicEmail("clinic_booking_rescheduled", payload, "https://tandmatch.dk");
    expect(moved.text).toContain("mandag 9. november kl. 13.00");
    expect(moved.text).toContain("tirsdag 10. november kl. 09.15");
  });

  it("akut lead: emnet nævner fristen", () => {
    expect(renderClinicEmail("clinic_new_lead", payload, "https://tandmatch.dk").subject).toBe("Ny henvendelse på TandMatch – svar inden kl. 16.30");
    expect(renderClinicEmail("clinic_new_lead", { leadId: LEAD }, "https://tandmatch.dk").subject).toBe("Ny henvendelse på TandMatch");
  });

  it("kaster ved manglende felt og ved et siteUrl, der ikke er http(s)", () => {
    expect(() => renderClinicEmail("clinic_new_lead", {}, "https://tandmatch.dk")).toThrow();
    expect(() => renderClinicEmail("clinic_booking_created", { leadId: LEAD }, "https://tandmatch.dk")).toThrow();
    expect(() => renderClinicEmail("clinic_new_lead", { leadId: LEAD }, "javascript:alert(1)")).toThrow();
  });

  it("escaper HTML", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
    const mail = renderClinicEmail("clinic_new_lead", { leadId: LEAD }, "https://tandmatch.dk/ignored/path?x=1");
    expect(mail.text).toContain(`https://tandmatch.dk/klinik/lead/${LEAD}`);
  });
});

describe("renderPatientPush og stier", () => {
  for (const type of PATIENT_NOTIFICATION_TYPES) {
    it(`${type}: fast tekst, ingen pladsholdere, tilladt sti`, () => {
      const push = renderPatientPush(type, poisoned as never);
      expect(push.title).toBe("TandMatch");
      expect(push.body).not.toMatch(/\{|\}|undefined|null|NaN/);
      for (const secret of SECRETS) expect(push.body).not.toContain(secret);
      expect(isAllowedNotificationPath(patientNotificationPath(type, payload))).toBe(true);
    });
  }

  it("teksterne", () => {
    expect(renderPatientPush("patient_booking_reminder", payload).body).toBe("Påmindelse: Du har en tandlægetid tirsdag 10. november kl. 09.15.");
    expect(renderPatientPush("patient_lead_answered", {}).body).toBe("Klinikken har svaret på din henvendelse.");
    expect(patientNotificationPath("patient_lead_answered", payload)).toBe(`/sag/${CASE}`);
    expect(patientNotificationPath("patient_new_message", payload)).toBe(`/sag/${CASE}/beskeder/${LEAD}`);
    expect(patientNotificationPath("patient_booking_cancelled", payload)).toBe("/bookinger");
  });

  it("stiernes tilladelsesliste", () => {
    for (const ok of ["/bookinger", `/sag/${CASE}`, `/sag/${CASE}/beskeder/${LEAD}`]) expect(isAllowedNotificationPath(ok)).toBe(true);
    for (const bad of [
      "/klinik",
      "https://evil.example/x",
      "//evil.example",
      "/sag/../x",
      `/sag/${CASE}?x=1`,
      `/sag/${CASE}/`,
      `/sag/${CASE}/beskeder`,
      "/bookinger/1",
      "",
      null,
      42,
    ]) {
      expect(isAllowedNotificationPath(bad)).toBe(false);
    }
  });
});

describe("web push til klinikken", () => {
  it("generisk tekst og tilladte stier", () => {
    for (const type of CLINIC_NOTIFICATION_TYPES) {
      const push = renderClinicWebPush(type, poisoned as never);
      expect(push.title).toBe("TandMatch");
      for (const secret of SECRETS) expect(push.body).not.toContain(secret);
      expect(isAllowedClinicNotificationPath(clinicNotificationPath(type, payload))).toBe(true);
    }
    expect(clinicNotificationPath("clinic_new_lead", payload)).toBe(`/klinik/lead/${LEAD}`);
    expect(clinicNotificationPath("clinic_booking_created", payload)).toBe("/klinik/kalender");
    expect(renderClinicWebPush("clinic_new_message", payload).body).toBe("Ny besked på TandMatch");
  });

  it("stiliste", () => {
    for (const bad of ["/klinik/profil", `/klinik/lead/${LEAD}?x=1`, "/klinik/lead/abc", "https://x.example", "/sag/" + CASE]) {
      expect(isAllowedClinicNotificationPath(bad)).toBe(false);
    }
  });
});

describe("parseNotificationPayload", () => {
  it("beholder kun tilladte nøgler med gyldige værdier", () => {
    expect(parseNotificationPayload({ ...poisoned })).toEqual({ ...payload });
    expect(parseNotificationPayload({ leadId: "ikke-et-id", startsAt: "i morgen" })).toEqual({});
    expect(parseNotificationPayload(null)).toEqual({});
    expect(parseNotificationPayload("x")).toEqual({});
  });
});

describe("skemaer", () => {
  it("push-token", () => {
    expect(registerPushTokenSchema.safeParse({ token: "ExponentPushToken[abcdefgh1234]", platform: "ios" }).success).toBe(true);
    expect(registerPushTokenSchema.safeParse({ token: "ExponentPushToken[ab]", platform: "ios" }).success).toBe(false);
    expect(registerPushTokenSchema.safeParse({ token: "ExponentPushToken[abcdefgh1234]", platform: "web" }).success).toBe(false);
    expect(registerPushTokenSchema.safeParse({ token: "ExponentPushToken[abcdefgh1234]", platform: "ios", x: 1 }).success).toBe(false);
  });
  it("indstillinger: alle felter, ingen ukendte", () => {
    const all = {
      emailNewLead: true, emailNewMessage: true, emailBookingChanges: true, emailBookingReminder: true,
      webPushNewLead: true, webPushNewMessage: true, webPushBookingChanges: true, webPushBookingReminder: false,
    };
    expect(notificationSettingsSchema.safeParse(all).success).toBe(true);
    expect(notificationSettingsSchema.safeParse({ ...all, extra: true }).success).toBe(false);
    const { emailNewLead: _omit, ...missing } = all;
    void _omit;
    expect(notificationSettingsSchema.safeParse(missing).success).toBe(false);
  });
  it("web push-abonnement: https hos en kendt push-tjeneste", () => {
    const keys = { p256dh: "k".repeat(87), auth: "a".repeat(22) };
    expect(registerWebPushSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys }).success).toBe(true);
    expect(registerWebPushSchema.safeParse({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc", keys }).success).toBe(true);
    expect(registerWebPushSchema.safeParse({ endpoint: "https://web.push.apple.com/abc", keys }).success).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/x",
      "https://evil.example/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
    ]) {
      expect(isAllowedWebPushEndpoint(bad)).toBe(false);
    }
    expect(registerWebPushSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "kort", auth: keys.auth } }).success).toBe(false);
    expect(registerWebPushSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys, extra: 1 }).success).toBe(false);
  });
});
