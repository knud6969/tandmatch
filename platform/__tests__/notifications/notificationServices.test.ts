import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleEmailService } from "@/platform/notifications/consoleEmailService";
import { ConsolePushService } from "@/platform/notifications/consolePushService";
import { ConsoleSmsService } from "@/platform/notifications/consoleSmsService";
import { ExpoPushService } from "@/platform/notifications/expoPushService";
import { FakePushService } from "@/platform/notifications/fakePushService";
import { FakeSmsService } from "@/platform/notifications/fakeSmsService";
import { NotificationDispatcher } from "@/platform/notifications/notificationDispatcher";
import { createEmailService, createPushService, createSmsService } from "@/platform/notifications/notificationServices";
import type { ClaimedNotification } from "@/platform/notifications/notificationOutboxRepository";
import { UnconfiguredEmailService, UnconfiguredSmsService } from "@/platform/notifications/unconfiguredServices";
import { FakeWebPushService } from "@/platform/notifications/fakeWebPushService";

vi.mock("server-only", () => ({}));

// Valg af tjenester efter miljø (platform 14.6; security L4): PUSH_LOG_ONLY virker ikke i produktion, og manglende nøgler i
// produktion giver `skipped`, aldrig `sent`.

afterEach(() => {
  vi.unstubAllEnvs();
});

function env(values: Record<string, string>) {
  for (const key of ["NOTIFICATIONS_FAKE", "RESEND_API_KEY", "EMAIL_FROM", "PUSH_LOG_ONLY"]) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

describe("createPushService", () => {
  it("PUSH_LOG_ONLY=1 giver konsoltjenesten uden for produktion", () => {
    env({ NODE_ENV: "development", PUSH_LOG_ONLY: "1" });
    expect(createPushService()).toBeInstanceOf(ConsolePushService);
  });

  it("PUSH_LOG_ONLY=1 virker ikke i produktion", () => {
    env({ NODE_ENV: "production", PUSH_LOG_ONLY: "1" });
    const service = createPushService();
    expect(service).toBeInstanceOf(ExpoPushService);
    expect(service).not.toBeInstanceOf(ConsolePushService);
  });

  it("NOTIFICATIONS_FAKE giver kun fakes uden for produktion", () => {
    env({ NODE_ENV: "test", NOTIFICATIONS_FAKE: "1" });
    expect(createPushService()).toBeInstanceOf(FakePushService);
    env({ NODE_ENV: "production", NOTIFICATIONS_FAKE: "1" });
    expect(createPushService()).toBeInstanceOf(ExpoPushService);
  });
});

describe("createEmailService og createSmsService", () => {
  it("uden nøgler logges der uden for produktion", () => {
    env({ NODE_ENV: "development" });
    expect(createEmailService()).toBeInstanceOf(ConsoleEmailService);
    expect(createSmsService()).toBeInstanceOf(ConsoleSmsService);
  });

  it("uden nøgler i produktion sendes intet, og rækken bliver skipped (ikke sent)", async () => {
    env({ NODE_ENV: "production" });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const email = createEmailService();
    const sms = createSmsService();
    expect(email).toBeInstanceOf(UnconfiguredEmailService);
    expect(sms).toBeInstanceOf(UnconfiguredSmsService);

    const mail: ClaimedNotification = {
      id: crypto.randomUUID(), type: "clinic_new_lead", channel: "email", payload: { leadId: "22222222-2222-4222-8222-222222222222" }, attempts: 1,
      clinicId: "44444444-4444-4444-8444-444444444444", recipientUserId: null, toEmail: "ejer@klinik.example", toPhone: null, pushTokens: [], webPushSubscriptions: [],
    };
    const text: ClaimedNotification = {
      ...mail, id: crypto.randomUUID(), type: "patient_booking_confirmed", channel: "sms", payload: { bookingId: "33333333-3333-4333-8333-333333333333", startsAt: "2026-11-10T09:00:00Z" },
      clinicId: null, recipientUserId: "55555555-5555-4555-8555-555555555555", toEmail: null, toPhone: "+45 12 34 56 78",
    };
    const complete = vi.fn(async () => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const dispatcher = new NotificationDispatcher({
      repository: { claim: vi.fn(async () => [mail, text]), complete },
      email,
      sms,
      push: new FakePushService(),
      webPush: new FakeWebPushService(),
      siteUrl: () => "https://tandmatch.dk",
    });
    expect(await dispatcher.flush()).toEqual({ sent: 0, failed: 0, skipped: 2, retried: 0 });
    expect(complete).toHaveBeenCalledWith(mail.id, "skipped", "EMAIL_NOT_CONFIGURED", undefined);
    expect(complete).toHaveBeenCalledWith(text.id, "skipped", "SMS_NOT_CONFIGURED", undefined);
  });

  it("i tests bruges fakes", () => {
    env({ NODE_ENV: "test", NOTIFICATIONS_FAKE: "1" });
    expect(createSmsService()).toBeInstanceOf(FakeSmsService);
  });
});
