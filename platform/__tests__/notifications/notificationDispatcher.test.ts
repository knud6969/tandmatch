import { describe, expect, it, vi } from "vitest";
import { FakeEmailService } from "@/platform/notifications/fakeEmailService";
import { FakePushService } from "@/platform/notifications/fakePushService";
import { FakeSmsService } from "@/platform/notifications/fakeSmsService";
import { FakeWebPushService } from "@/platform/notifications/fakeWebPushService";
import { notificationSiteUrl } from "@/platform/notifications/notificationController";
import { NotificationDispatcher } from "@/platform/notifications/notificationDispatcher";
import type { ClaimedNotification } from "@/platform/notifications/notificationOutboxRepository";

vi.mock("server-only", () => ({}));

const CASE = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const CLINIC = "44444444-4444-4444-8444-444444444444";

function row(partial: Partial<ClaimedNotification>): ClaimedNotification {
  return {
    id: crypto.randomUUID(), type: "clinic_new_lead", channel: "email", payload: { leadId: LEAD }, attempts: 1,
    clinicId: CLINIC, recipientUserId: null, toEmail: "ejer@klinik.example", toPhone: null, pushTokens: [], webPushSubscriptions: [], ...partial,
  };
}

function setup(rows: ClaimedNotification[], opts: { email?: FakeEmailService; push?: FakePushService; sms?: FakeSmsService; webPush?: FakeWebPushService; siteUrl?: string | null } = {}) {
  const complete = vi.fn(async () => undefined);
  const repository = { claim: vi.fn(async () => rows), complete };
  const email = opts.email ?? new FakeEmailService();
  const push = opts.push ?? new FakePushService();
  const webPush = opts.webPush ?? new FakeWebPushService();
  const sms = opts.sms ?? new FakeSmsService();
  const dispatcher = new NotificationDispatcher({ repository, email, push, sms, webPush, siteUrl: () => (opts.siteUrl === undefined ? "https://tandmatch.dk" : opts.siteUrl) });
  return { dispatcher, complete, email, push, sms, webPush };
}

describe("NotificationDispatcher", () => {
  it("e-mail: sender, bruger rækkens id som idempotensnøgle og markerer sent", async () => {
    const r = row({});
    const { dispatcher, complete, email } = setup([r]);
    expect(await dispatcher.flush()).toEqual({ sent: 1, failed: 0, skipped: 0, retried: 0 });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ to: "ejer@klinik.example", idempotencyKey: r.id, subject: "Ny henvendelse på TandMatch" });
    expect(email.sent[0].text).toContain(`https://tandmatch.dk/klinik/lead/${LEAD}`);
    expect(complete).toHaveBeenCalledWith(r.id, "sent", undefined, undefined);
  });

  it("retry ved en midlertidig fejl, failed ved en varig", async () => {
    const a = row({});
    const b = row({});
    const retry = setup([a], { email: new FakeEmailService({ code: "RESEND_429", retryable: true }) });
    expect(await retry.dispatcher.flush()).toEqual({ sent: 0, failed: 0, skipped: 0, retried: 1 });
    expect(retry.complete).toHaveBeenCalledWith(a.id, "retry", "RESEND_429", undefined);
    const failed = setup([b], { email: new FakeEmailService({ code: "RESEND_422", retryable: false }) });
    expect(await failed.dispatcher.flush()).toEqual({ sent: 0, failed: 1, skipped: 0, retried: 0 });
    expect(failed.complete).toHaveBeenCalledWith(b.id, "failed", "RESEND_422", undefined);
  });

  it("skipped uden mål eller uden SITE_URL", async () => {
    const none = row({ toEmail: null });
    const s1 = setup([none]);
    expect(await s1.dispatcher.flush()).toMatchObject({ skipped: 1 });
    expect(s1.complete).toHaveBeenCalledWith(none.id, "skipped", "NO_RECIPIENT", undefined);
    const noSite = row({});
    const s2 = setup([noSite], { siteUrl: null });
    expect(await s2.dispatcher.flush()).toMatchObject({ skipped: 1 });
    expect(s2.complete).toHaveBeenCalledWith(noSite.id, "skipped", "NO_SITE_URL", undefined);
    const noTokens = row({ type: "patient_lead_answered", channel: "push", payload: { caseId: CASE, leadId: LEAD }, toEmail: null });
    const s3 = setup([noTokens]);
    expect((await s3.dispatcher.flush()).skipped).toBe(1);
  });

  it("én fejlende række stopper ikke de andre", async () => {
    const broken = row({ payload: {} }); // mangler leadId: kan ikke renderes
    const good = row({});
    const { dispatcher, complete, email } = setup([broken, good]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await dispatcher.flush()).toEqual({ sent: 1, failed: 1, skipped: 0, retried: 0 });
    spy.mockRestore();
    expect(email.sent).toHaveLength(1);
    expect(complete).toHaveBeenCalledWith(broken.id, "failed", "DISPATCH_ERROR", undefined);
  });

  it("en fejl i complete stopper heller ikke de andre", async () => {
    const rows = [row({}), row({})];
    const { dispatcher, complete } = setup(rows);
    complete.mockRejectedValueOnce(new Error("db"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await dispatcher.flush()).toMatchObject({ sent: 1 });
    spy.mockRestore();
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("push: fast tekst og sti, ugyldige tokens sendes til sletning", async () => {
    const r = row({ type: "patient_new_message", channel: "push", payload: { caseId: CASE, leadId: LEAD }, toEmail: null, clinicId: null, recipientUserId: "p1", pushTokens: ["ExponentPushToken[goodgoodgood]", "ExponentPushToken[deaddeaddead]"] });
    const push = new FakePushService({ "ExponentPushToken[deaddeaddead]": { status: "invalid_target" } });
    const { dispatcher, complete } = setup([r], { push });
    expect(await dispatcher.flush()).toMatchObject({ sent: 1 });
    expect(push.sent[0]).toMatchObject({ title: "TandMatch", body: "Du har en ny besked fra klinikken.", data: { type: "patient_new_message", path: `/sag/${CASE}/beskeder/${LEAD}` } });
    expect(complete).toHaveBeenCalledWith(r.id, "sent", undefined, ["ExponentPushToken[deaddeaddead]"]);
  });

  it("push: alle tokens ugyldige giver skipped, kun midlertidige fejl giver retry", async () => {
    const gone = row({ type: "patient_lead_answered", channel: "push", payload: { caseId: CASE }, toEmail: null, pushTokens: ["ExponentPushToken[deaddeaddead]"] });
    const s1 = setup([gone], { push: new FakePushService({ "ExponentPushToken[deaddeaddead]": { status: "invalid_target" } }) });
    await s1.dispatcher.flush();
    expect(s1.complete).toHaveBeenCalledWith(gone.id, "skipped", "EXPO_DEVICE_NOT_REGISTERED", ["ExponentPushToken[deaddeaddead]"]);
    const later = row({ type: "patient_lead_answered", channel: "push", payload: { caseId: CASE }, toEmail: null, pushTokens: ["ExponentPushToken[slowslowslow]"] });
    const s2 = setup([later], { push: new FakePushService({ "ExponentPushToken[slowslowslow]": { status: "error", code: "EXPO_HTTP_500", retryable: true } }) });
    expect(await s2.dispatcher.flush()).toMatchObject({ retried: 1 });
  });

  it("web push: generisk tekst og tilladt sti; ugyldigt endpoint slettes", async () => {
    const good = { endpoint: "https://fcm.googleapis.com/fcm/send/good", p256dh: "k".repeat(87), auth: "a".repeat(22) };
    const gone = { endpoint: "https://fcm.googleapis.com/fcm/send/gone", p256dh: "k".repeat(87), auth: "a".repeat(22) };
    const r = row({ type: "clinic_booking_created", channel: "web_push", toEmail: null, payload: { leadId: LEAD, bookingId: BOOKING, startsAt: "2026-11-10T08:15:00Z" }, webPushSubscriptions: [good, gone] });
    const webPush = new FakeWebPushService({ [gone.endpoint]: { status: "invalid_target" } });
    const { dispatcher, complete } = setup([r], { webPush });
    expect(await dispatcher.flush()).toMatchObject({ sent: 1 });
    expect(webPush.sent[0]).toMatchObject({ title: "TandMatch", body: "Ny booking på TandMatch", data: { type: "clinic_booking_created", path: "/klinik/kalender" } });
    expect(complete).toHaveBeenCalledWith(r.id, "sent", undefined, [gone.endpoint]);
    const none = row({ type: "clinic_new_lead", channel: "web_push", toEmail: null, webPushSubscriptions: [] });
    const s2 = setup([none]);
    await s2.dispatcher.flush();
    expect(s2.complete).toHaveBeenCalledWith(none.id, "skipped", "NO_RECIPIENT", undefined);
  });

  it("indholdet har aldrig navne, opsummering eller beskedtekst, selv hvis payload har ekstra felter", async () => {
    const r = row({ payload: { leadId: LEAD, name: "Alma Hansen", summary: "Hul i tand", body: "Hemmelig" } });
    const { dispatcher, email } = setup([r]);
    await dispatcher.flush();
    const all = JSON.stringify(email.sent);
    for (const secret of ["Alma", "Hul i tand", "Hemmelig"]) expect(all).not.toContain(secret);
  });
});

describe("patientens e-mail og SMS (platform 14.12)", () => {
  const PATIENT = "55555555-5555-4555-8555-555555555555";
  const booked = { bookingId: BOOKING, startsAt: "2026-11-10T08:15:00Z" };

  it("sender generisk e-mail og SMS med tidspunktet, aldrig behandling eller klinik", async () => {
    const mail = row({ type: "patient_booking_created", channel: "email", clinicId: null, recipientUserId: PATIENT, toEmail: "lea@example.com", payload: booked });
    const text = row({ type: "patient_booking_reminder", channel: "sms", clinicId: null, recipientUserId: PATIENT, toEmail: null, toPhone: "+45 12 34 56 78", payload: booked });
    const { dispatcher, email, sms } = setup([mail, text]);
    expect(await dispatcher.flush()).toMatchObject({ sent: 2 });
    expect(email.sent[0]).toMatchObject({ to: "lea@example.com", subject: "Din tid på TandMatch er booket", recipient: { kind: "patient", id: PATIENT } });
    expect(email.sent[0].text).toContain("kl. 09.15");
    expect(sms.sent[0].body).toBe("TandMatch: Du har en tid på TandMatch tirsdag 10. november kl. 09.15. Se detaljer i appen.");
  });

  it("mangler e-mail eller nummer, springes kanalen over og logges uden adresse, nummer og tekst", async () => {
    const mail = row({ type: "patient_booking_cancelled", channel: "email", clinicId: null, recipientUserId: PATIENT, toEmail: null, payload: { bookingId: BOOKING } });
    const text = row({ type: "patient_review_reminder", channel: "sms", clinicId: null, recipientUserId: PATIENT, toEmail: null, toPhone: null, payload: booked });
    const noToken = row({ type: "patient_booking_confirmed", channel: "push", clinicId: null, recipientUserId: PATIENT, toEmail: null, payload: { caseId: CASE, leadId: LEAD }, pushTokens: [] });
    const { dispatcher, complete } = setup([mail, text, noToken]);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(await dispatcher.flush()).toMatchObject({ skipped: 3 });
    const lines = log.mock.calls.map((c) => String(c[0]));
    log.mockRestore();
    expect(lines).toEqual([
      `[email] patient_booking_cancelled til patient ${PATIENT} sprunget over: NO_RECIPIENT (outbox ${mail.id})`,
      `[sms] patient_review_reminder til patient ${PATIENT} sprunget over: NO_RECIPIENT (outbox ${text.id})`,
      `[push] patient_booking_confirmed til patient ${PATIENT} sprunget over: NO_RECIPIENT (outbox ${noToken.id})`,
    ]);
    expect(complete).toHaveBeenCalledWith(mail.id, "skipped", "NO_RECIPIENT", undefined);
  });

  it("svar på henvendelse og beskeder giver aldrig e-mail eller SMS", async () => {
    for (const type of ["patient_lead_answered", "patient_new_message"] as const) {
      const mail = row({ type, channel: "email", clinicId: null, recipientUserId: PATIENT, toEmail: "lea@example.com", payload: { caseId: CASE, leadId: LEAD } });
      const text = row({ type, channel: "sms", clinicId: null, recipientUserId: PATIENT, toEmail: null, toPhone: "+45 12 34 56 78", payload: { caseId: CASE, leadId: LEAD } });
      const { dispatcher, email, sms } = setup([mail, text]);
      expect(await dispatcher.flush()).toMatchObject({ sent: 0, failed: 2 });
      expect(email.sent).toHaveLength(0);
      expect(sms.sent).toHaveLength(0);
    }
  });
});

describe("notificationSiteUrl", () => {
  it("SITE_URL, ellers localhost uden for produktion, ellers null", () => {
    expect(notificationSiteUrl("https://tandmatch.dk/sti", true)).toBe("https://tandmatch.dk");
    expect(notificationSiteUrl(undefined, false)).toBe("http://localhost:3000");
    expect(notificationSiteUrl(undefined, true)).toBeNull();
    expect(notificationSiteUrl("javascript:alert(1)", false)).toBeNull();
    expect(notificationSiteUrl("ikke en adresse", false)).toBeNull();
  });
});
