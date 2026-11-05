import { describe, expect, it, vi } from "vitest";
import {
  CLINIC_NOTIFICATION_TYPES,
  PATIENT_CONTACT_NOTIFICATION_TYPES,
  PATIENT_NOTIFICATION_TYPES,
} from "@/lib/common/constants/notifications";
import {
  isAllowedClinicNotificationPath,
  isAllowedNotificationPath,
  isPatientContactNotificationType,
  parseNotificationPayload,
  renderInboxContent,
  renderPatientEmail,
  renderPatientSms,
} from "@/lib/common/domain/notifications";
import { markNotificationsReadSchema } from "@/lib/common/schemas/notifications";
import { putNotificationContactSchema } from "@/lib/identity/schemas/notification-contact";
import { ConsoleEmailService } from "@/platform/notifications/consoleEmailService";
import { ConsoleSmsService } from "@/platform/notifications/consoleSmsService";
import { FakeSmsService } from "@/platform/notifications/fakeSmsService";

vi.mock("server-only", () => ({}));

const CASE = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const payload = {
  caseId: CASE,
  leadId: LEAD,
  bookingId: BOOKING,
  startsAt: "2026-11-10T08:15:00Z", // 09.15 dansk tid
  previousStartsAt: "2026-11-09T12:00:00Z", // 13.00
  holdExpiresAt: "2026-11-05T15:30:00Z",
};
const poisoned = { ...payload, name: "Alma Hansen", summary: "Hul i kindtand", body: "Hemmelig besked", phone: "+45 12345678", email: "alma@example.com" };
const SECRETS = ["Alma", "Hansen", "kindtand", "Hemmelig", "12345678", "alma@example.com"];

describe("renderInboxContent (klokken, platform 14.11)", () => {
  for (const type of [...CLINIC_NOTIFICATION_TYPES, ...PATIENT_NOTIFICATION_TYPES]) {
    it(`${type}: dansk tekst, ingen pladsholdere, tilladt sti, ingen persondata`, () => {
      const content = renderInboxContent(type, parseNotificationPayload(poisoned));
      const text = `${content.title} ${content.body ?? ""}`;
      expect(text).not.toMatch(/\{|\}|undefined|null|NaN/);
      for (const secret of SECRETS) expect(text).not.toContain(secret);
      const clinic = type.startsWith("clinic_");
      expect(clinic ? isAllowedClinicNotificationPath(content.path) : isAllowedNotificationPath(content.path)).toBe(true);
    });
  }

  it("bookingtyperne har tidspunktet i dansk tid, og en flyttet tid har både gammel og ny", () => {
    expect(renderInboxContent("clinic_booking_created", payload).body).toBe("tirsdag 10. november kl. 09.15.");
    expect(renderInboxContent("clinic_booking_rescheduled", payload).body).toBe("Fra mandag 9. november kl. 13.00 til tirsdag 10. november kl. 09.15.");
  });

  it("stierne: lead for henvendelse og besked, kalender for bookinger, anmeldelse for patientens påmindelse", () => {
    expect(renderInboxContent("clinic_new_lead", payload).path).toBe(`/klinik/lead/${LEAD}`);
    expect(renderInboxContent("clinic_booking_cancelled", payload).path).toBe("/klinik/kalender");
    expect(renderInboxContent("patient_review_reminder", payload).path).toBe(`/anmeld/${BOOKING}`);
    expect(renderInboxContent("patient_new_message", payload).path).toBe(`/sag/${CASE}/beskeder/${LEAD}`);
  });

  it("kaster, hvis payload mangler det, typen kræver (rækken springes over af repositoriet)", () => {
    expect(() => renderInboxContent("clinic_new_lead", {})).toThrow();
    expect(() => renderInboxContent("patient_booking_reminder", { bookingId: BOOKING })).toThrow();
  });
});

describe("patientens e-mail og SMS (platform 14.12)", () => {
  it("kun de syv booking-typer er kontakttyper; svar og beskeder er det ikke", () => {
    expect([...PATIENT_CONTACT_NOTIFICATION_TYPES].sort()).toEqual(
      [
        "patient_booking_cancelled",
        "patient_booking_cancelled_self",
        "patient_booking_confirmed",
        "patient_booking_created",
        "patient_booking_reminder",
        "patient_booking_rescheduled",
        "patient_review_reminder",
      ].sort(),
    );
    expect(isPatientContactNotificationType("patient_lead_answered")).toBe(false);
    expect(isPatientContactNotificationType("patient_new_message")).toBe(false);
    for (const type of CLINIC_NOTIFICATION_TYPES) expect(isPatientContactNotificationType(type)).toBe(false);
  });

  for (const type of PATIENT_CONTACT_NOTIFICATION_TYPES) {
    it(`${type}: generisk tekst uden persondata, behandling eller klinik`, () => {
      const parsed = parseNotificationPayload(poisoned);
      const mail = renderPatientEmail(type, parsed);
      const sms = renderPatientSms(type, parsed);
      for (const part of [mail.subject, mail.text, mail.html, sms]) {
        expect(part).not.toMatch(/\{|\}|undefined|null|NaN/);
        for (const secret of SECRETS) expect(part).not.toContain(secret);
        expect(part).not.toMatch(/https?:/);
      }
      expect(sms.startsWith("TandMatch: ")).toBe(true);
      expect(sms.length).toBeLessThanOrEqual(160);
    });
  }

  it("en flyttet tid giver én bekræftelse med den nye tid, ikke en aflysning", () => {
    const sms = renderPatientSms("patient_booking_rescheduled", payload);
    expect(sms).toBe("TandMatch: Du har en tid på TandMatch tirsdag 10. november kl. 09.15. Se detaljer i appen.");
    expect(renderPatientEmail("patient_booking_rescheduled", payload).subject).toBe("Din tid på TandMatch er booket");
  });

  it("uden tidspunkt i payload udelades det (klinikkens aflysning)", () => {
    expect(renderPatientSms("patient_booking_cancelled", { bookingId: BOOKING })).toBe("TandMatch: Din tid på TandMatch er aflyst. Se detaljer i appen.");
    expect(renderPatientSms("patient_booking_cancelled_self", payload)).toContain("tirsdag 10. november kl. 09.15");
  });

  it("anmeldelsespåmindelsen nævner ikke tidspunkt eller behandling", () => {
    expect(renderPatientSms("patient_review_reminder", payload)).toBe("TandMatch: Du har haft en tid på TandMatch. Skriv gerne en anmeldelse i appen.");
  });
});

describe("SmsService", () => {
  const message = { to: "+45 12 34 56 78", body: "TandMatch: Hemmelig tekst", idempotencyKey: "o-1", type: "patient_booking_created" as const, patientId: "p-1" };

  it("Console logger kun type, patient-id og outbox-id, aldrig nummer eller tekst", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await new ConsoleSmsService().send(message);
    const lines = info.mock.calls.map((c) => String(c[0]));
    info.mockRestore();
    expect(lines).toEqual(["[sms] patient_booking_created til patient p-1 (outbox o-1)"]);
  });

  it("Console-mailen logger patientens id, ikke adressen", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await new ConsoleEmailService().send({ to: "lea@example.com", subject: "Emne", text: "Tekst", html: "<p>Tekst</p>", idempotencyKey: "o-2", type: "patient_booking_created", recipient: { kind: "patient", id: "p-1" } });
    const lines = info.mock.calls.map((c) => String(c[0]));
    info.mockRestore();
    expect(lines).toEqual(["[email] patient_booking_created til patient p-1 (outbox o-2)"]);
  });

  it("afviser ugyldigt nummer og tom eller for lang tekst uden at gemme noget", async () => {
    const fake = new FakeSmsService();
    await expect(fake.send({ ...message, to: "123" })).rejects.toMatchObject({ code: "INVALID_RECIPIENT", retryable: false });
    await expect(fake.send({ ...message, to: "ikke et nummer" })).rejects.toMatchObject({ code: "INVALID_RECIPIENT" });
    await expect(fake.send({ ...message, body: "" })).rejects.toMatchObject({ code: "INVALID_MESSAGE" });
    await expect(fake.send({ ...message, body: "x".repeat(321) })).rejects.toMatchObject({ code: "INVALID_MESSAGE" });
    expect(fake.sent).toHaveLength(0);
    await fake.send(message);
    expect(fake.sent).toHaveLength(1);
  });

  it("Fake kan sættes til at fejle med en kode", async () => {
    const fake = new FakeSmsService({ code: "SMS_500", retryable: true });
    await expect(fake.send(message)).rejects.toMatchObject({ code: "SMS_500", retryable: true });
  });
});

describe("skemaer", () => {
  it("markNotificationsReadSchema: ids er valgfrie, 1-100 uuid'er, ingen ekstra felter", () => {
    expect(markNotificationsReadSchema.safeParse({}).success).toBe(true);
    expect(markNotificationsReadSchema.safeParse({ ids: [LEAD] }).success).toBe(true);
    expect(markNotificationsReadSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(markNotificationsReadSchema.safeParse({ ids: ["x"] }).success).toBe(false);
    expect(markNotificationsReadSchema.safeParse({ ids: Array.from({ length: 101 }, () => LEAD) }).success).toBe(false);
    expect(markNotificationsReadSchema.safeParse({ all: true }).success).toBe(false);
  });

  it("putNotificationContactSchema: e-mail og telefon, begge kan ryddes med null", () => {
    expect(putNotificationContactSchema.safeParse({ email: null, phone: null }).success).toBe(true);
    expect(putNotificationContactSchema.safeParse({ email: " lea@example.com ", phone: "+45 12 34 56 78" })).toMatchObject({ success: true, data: { email: "lea@example.com" } });
    expect(putNotificationContactSchema.safeParse({ email: "lea", phone: null }).success).toBe(false);
    expect(putNotificationContactSchema.safeParse({ email: null, phone: "123" }).success).toBe(false);
    expect(putNotificationContactSchema.safeParse({ email: null }).success).toBe(false);
    expect(putNotificationContactSchema.safeParse({ email: null, phone: null, extra: 1 }).success).toBe(false);
  });
});
