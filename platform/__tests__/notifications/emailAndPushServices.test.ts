import { describe, expect, it, vi } from "vitest";
import { ConsoleEmailService } from "@/platform/notifications/consoleEmailService";
import { ConsolePushService } from "@/platform/notifications/consolePushService";
import { ConsoleWebPushService } from "@/platform/notifications/consoleWebPushService";
import type { EmailMessage } from "@/platform/notifications/emailService";
import { ExpoPushService } from "@/platform/notifications/expoPushService";
import { NotificationDeliveryError } from "@/platform/notifications/notificationErrors";
import { ResendEmailService } from "@/platform/notifications/resendEmailService";

vi.mock("server-only", () => ({}));

const message: EmailMessage = {
  to: "ejer@klinik.example",
  subject: "Ny henvendelse på TandMatch",
  text: "Hemmelig brødtekst",
  html: "<p>Hemmelig brødtekst</p>",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  type: "clinic_new_lead",
  clinicId: "22222222-2222-4222-8222-222222222222",
};

function stub(status: number, body = "{}"): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(body, { status }));
}

describe("ResendEmailService", () => {
  it("sender til Resend med de rigtige headere og body", async () => {
    const fetchMock = stub(200);
    await new ResendEmailService("re_key", "TandMatch <a@tandmatch.dk>", fetchMock as never).send(message);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");
    expect(headers["Idempotency-Key"]).toBe(message.idempotencyKey);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ from: "TandMatch <a@tandmatch.dk>", to: [message.to], subject: message.subject, text: message.text, html: message.html });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [429, true, "RESEND_429"],
    [500, true, "RESEND_500"],
    [503, true, "RESEND_503"],
    [400, false, "RESEND_400"],
    [422, false, "RESEND_422"],
  ])("status %i: retryable=%s", async (status, retryable, code) => {
    const error = await new ResendEmailService("k", "f@x.dk", stub(status, '{"message":"hemmelig e-mail ejer@klinik.example"}') as never).send(message).catch((e) => e);
    expect(error).toBeInstanceOf(NotificationDeliveryError);
    expect(error.retryable).toBe(retryable);
    expect(error.code).toBe(code);
    expect(String(error.message)).not.toContain("ejer@");
  });

  it("timeout og netværksfejl er retryable", async () => {
    const failing = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError");
    });
    const error = await new ResendEmailService("k", "f@x.dk", failing as never).send(message).catch((e) => e);
    expect(error).toMatchObject({ code: "RESEND_NETWORK", retryable: true });
  });

  it("basisklassen afviser en ugyldig modtager uden at kalde tjenesten", async () => {
    const fetchMock = stub(200);
    const error = await new ResendEmailService("k", "f@x.dk", fetchMock as never).send({ ...message, to: "ikke en adresse" }).catch((e) => e);
    expect(error).toMatchObject({ code: "INVALID_RECIPIENT", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ExpoPushService", () => {
  const push = (to: string) => ({ to, title: "TandMatch", body: "Hej", data: { type: "patient_lead_answered" as const, path: "/bookinger" } });

  it("sender i bundter af højst 100 og bevarer rækkefølgen", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string) as unknown[];
      return new Response(JSON.stringify({ data: sent.map(() => ({ status: "ok" })) }), { status: 200 });
    });
    const tokens = Array.from({ length: 230 }, (_, i) => `ExponentPushToken[t${i}xxxxxxxx]`);
    const results = await new ExpoPushService("tok", fetchMock as never).send(tokens.map(push));
    expect(results).toHaveLength(230);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const first = JSON.parse(init.body as string) as { sound: string; to: string }[];
    expect(first).toHaveLength(100);
    expect(first[0]).toMatchObject({ sound: "default", to: tokens[0], title: "TandMatch" });
  });

  it("uden adgangstoken sendes ingen Authorization-header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 }));
    await new ExpoPushService(undefined, fetchMock as never).send([push("ExponentPushToken[abcdefgh]")]);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("DeviceNotRegistered giver invalid_target, øvrige fejl en kode", async () => {
    const data = [
      { status: "ok" },
      { status: "error", message: "hemmelig", details: { error: "DeviceNotRegistered" } },
      { status: "error", details: { error: "MessageRateExceeded" } },
      { status: "error", details: { error: "InvalidCredentials" } },
    ];
    const results = await new ExpoPushService(undefined, vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 })) as never).send(
      data.map((_, i) => push(`ExponentPushToken[abcdefg${i}]`)),
    );
    expect(results).toEqual([
      { status: "ok" },
      { status: "invalid_target" },
      { status: "error", code: "EXPO_MESSAGERATEEXCEEDED", retryable: true },
      { status: "error", code: "EXPO_INVALIDCREDENTIALS", retryable: false },
    ]);
  });

  it("HTTP 429/5xx og netværksfejl er retryable, 4xx ikke", async () => {
    const run = async (f: unknown) => (await new ExpoPushService(undefined, f as never).send([push("ExponentPushToken[abcdefgh]")]))[0];
    expect(await run(stub(500))).toEqual({ status: "error", code: "EXPO_HTTP_500", retryable: true });
    expect(await run(stub(429))).toEqual({ status: "error", code: "EXPO_HTTP_429", retryable: true });
    expect(await run(stub(400))).toEqual({ status: "error", code: "EXPO_HTTP_400", retryable: false });
    expect(await run(vi.fn(async () => { throw new Error("net"); }))).toEqual({ status: "error", code: "EXPO_NETWORK", retryable: true });
    expect(await run(stub(200, "ikke json"))).toEqual({ status: "error", code: "EXPO_BAD_RESPONSE", retryable: true });
  });
});

describe("Console-tjenesterne", () => {
  it("logger hverken adresse, token, emne, tekst eller link", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await new ConsoleEmailService().send(message);
    await new ConsolePushService().send([{ to: "ExponentPushToken[hemmeligtoken]", title: "TandMatch", body: "Hemmelig tekst", data: { type: "patient_lead_answered", path: "/sag/x" }, recipientId: "p-1" }]);
    await new ConsoleWebPushService().send([
      { to: { endpoint: "https://fcm.googleapis.com/hemmelig", p256dh: "k", auth: "a" }, title: "TandMatch", body: "Hemmelig tekst", data: { type: "clinic_new_lead", path: "/klinik/kalender" }, clinicId: "c-1" },
    ]);
    const output = log.mock.calls.map((c) => c.join(" ")).join("\n");
    log.mockRestore();
    expect(output).toContain("[email] clinic_new_lead til klinik 22222222-2222-4222-8222-222222222222 (outbox 11111111-1111-4111-8111-111111111111)");
    expect(output).toContain("[push] patient_lead_answered til patient p-1 (1 enheder)");
    expect(output).toContain("[web-push] clinic_new_lead til klinik c-1 (1 browsere)");
    for (const secret of ["ejer@", "klinik.example", "Hemmelig", "hemmeligtoken", "hemmelig", "Ny henvendelse"]) {
      expect(output).not.toContain(secret);
    }
  });
});
