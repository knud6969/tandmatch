import "server-only";
import { EmailService } from "@/platform/notifications/emailService";
import { NotificationSkippedError } from "@/platform/notifications/notificationErrors";
import { SmsService } from "@/platform/notifications/smsService";

// Produktion uden en opsat tjeneste (security L4): intet sendes, og rækken i outboxen markeres `skipped` (ikke `sent`), så
// statussen aldrig påstår, at en besked er afsendt. Uden for produktion bruges i stedet Console*-tjenesterne, der logger.
export class UnconfiguredEmailService extends EmailService {
  protected async deliver(): Promise<void> {
    throw new NotificationSkippedError("EMAIL_NOT_CONFIGURED");
  }
}

export class UnconfiguredSmsService extends SmsService {
  protected async deliver(): Promise<void> {
    throw new NotificationSkippedError("SMS_NOT_CONFIGURED");
  }
}
