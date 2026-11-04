import "server-only";
import {
  clinicNotificationPath,
  isClinicNotificationType,
  isPatientNotificationType,
  parseNotificationPayload,
  patientNotificationPath,
  renderClinicEmail,
  renderClinicWebPush,
  renderPatientPush,
} from "@/lib/common/domain/notifications";
import type { ClinicNotificationType, NotificationPayload, PatientNotificationType } from "@/lib/common/types/notifications";
import type { EmailService } from "@/platform/notifications/emailService";
import { NotificationDeliveryError, type DeliveryResult } from "@/platform/notifications/notificationErrors";
import type { ClaimedNotification, CompletionStatus, NotificationOutboxRepository } from "@/platform/notifications/notificationOutboxRepository";
import type { PushService } from "@/platform/notifications/pushService";
import type { WebPushService } from "@/platform/notifications/webPushService";

export type FlushSummary = { sent: number; failed: number; skipped: number; retried: number };

// Hvad der skal skrives tilbage til outboxen for én række.
type Outcome = { status: CompletionStatus; code?: string; invalid?: string[] };

export type DispatcherDeps = {
  repository: Pick<NotificationOutboxRepository, "claim" | "complete">;
  email: EmailService;
  push: PushService;
  webPush: WebPushService;
  // Basisadressen til links i e-mails; null = ingen (e-mails springes over med NO_SITE_URL).
  siteUrl: () => string | null;
};

// Sender det, der ligger i outboxen (platform 14.6): claim -> byg beskeden af rene funktioner -> send -> complete.
// En fejl i én række påvirker aldrig de andre. Holder ingen tilstand mellem kald.
export class NotificationDispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  async flush(limit = 20): Promise<FlushSummary> {
    const summary: FlushSummary = { sent: 0, failed: 0, skipped: 0, retried: 0 };
    const rows = await this.deps.repository.claim(limit);
    for (const row of rows) {
      const outcome = await this.process(row);
      try {
        await this.deps.repository.complete(row.id, outcome.status, outcome.code, outcome.invalid);
      } catch (error) {
        // Låsen udløber, og rækken tages igen. Kun fejlnavnet logges.
        console.error("notifikation: kunne ikke afslutte en række", error instanceof Error ? error.name : "ukendt");
        continue;
      }
      if (outcome.status === "sent") summary.sent += 1;
      else if (outcome.status === "failed") summary.failed += 1;
      else if (outcome.status === "skipped") summary.skipped += 1;
      else summary.retried += 1;
    }
    return summary;
  }

  private async process(row: ClaimedNotification): Promise<Outcome> {
    try {
      const payload = parseNotificationPayload(row.payload);
      if (row.channel === "email") return await this.sendEmail(row, payload);
      if (row.channel === "web_push") return await this.sendWebPush(row, payload);
      return await this.sendPush(row, payload);
    } catch (error) {
      if (error instanceof NotificationDeliveryError) return this.failure(error.code, error.retryable);
      // Render- eller programfejl: kan ikke lykkes ved et nyt forsøg.
      console.error("notifikation: fejl ved afsendelse", error instanceof Error ? error.name : "ukendt");
      return { status: "failed", code: "DISPATCH_ERROR" };
    }
  }

  private failure(code: string, retryable: boolean): Outcome {
    // Databasen gør selv retry til failed efter NOTIFY_MAX_ATTEMPTS forsøg.
    return { status: retryable ? "retry" : "failed", code };
  }

  private async sendEmail(row: ClaimedNotification, payload: NotificationPayload): Promise<Outcome> {
    if (!isClinicNotificationType(row.type)) return { status: "failed", code: "INVALID_TYPE" };
    if (!row.toEmail) return { status: "skipped", code: "NO_RECIPIENT" };
    const siteUrl = this.deps.siteUrl();
    if (!siteUrl) return { status: "skipped", code: "NO_SITE_URL" };
    const content = renderClinicEmail(row.type as ClinicNotificationType, payload, siteUrl);
    await this.deps.email.send({
      to: row.toEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
      idempotencyKey: row.id,
      type: row.type,
      clinicId: row.clinicId ?? "ukendt",
    });
    return { status: "sent" };
  }

  private async sendPush(row: ClaimedNotification, payload: NotificationPayload): Promise<Outcome> {
    if (!isPatientNotificationType(row.type)) return { status: "failed", code: "INVALID_TYPE" };
    if (row.pushTokens.length === 0) return { status: "skipped", code: "NO_RECIPIENT" };
    const type = row.type as PatientNotificationType;
    const content = renderPatientPush(type, payload);
    const data = { type, path: patientNotificationPath(type, payload) };
    const results = await this.deps.push.send(
      row.pushTokens.map((to) => ({ to, title: content.title, body: content.body, data, recipientId: row.recipientUserId ?? undefined })),
    );
    return this.summarize(results, row.pushTokens, "EXPO_DEVICE_NOT_REGISTERED");
  }

  private async sendWebPush(row: ClaimedNotification, payload: NotificationPayload): Promise<Outcome> {
    if (!isClinicNotificationType(row.type)) return { status: "failed", code: "INVALID_TYPE" };
    if (row.webPushSubscriptions.length === 0) return { status: "skipped", code: "NO_RECIPIENT" };
    const type = row.type as ClinicNotificationType;
    const content = renderClinicWebPush(type, payload);
    const data = { type, path: clinicNotificationPath(type, payload) };
    const results = await this.deps.webPush.send(
      row.webPushSubscriptions.map((to) => ({ to, title: content.title, body: content.body, data, clinicId: row.clinicId ?? undefined })),
    );
    return this.summarize(results, row.webPushSubscriptions.map((s) => s.endpoint), "WEBPUSH_SUBSCRIPTION_GONE");
  }

  // Samler resultaterne pr. enhed: sendt, hvis mindst én lykkedes; ellers retry ved en midlertidig fejl, failed ved en
  // varig, og skipped, hvis alle mål var ugyldige. Ugyldige mål slettes af databasen.
  private summarize(results: DeliveryResult[], targets: string[], goneCode: string): Outcome {
    const invalid = targets.filter((_, i) => results[i]?.status === "invalid_target");
    if (results.some((r) => r.status === "ok")) return { status: "sent", invalid };
    const errors = results.filter((r): r is Extract<DeliveryResult, { status: "error" }> => r.status === "error");
    if (errors.length === 0) return { status: "skipped", code: goneCode, invalid };
    const retryable = errors.find((e) => e.retryable);
    if (retryable) return { status: "retry", code: retryable.code, invalid };
    return { status: "failed", code: errors[0].code, invalid };
  }
}
