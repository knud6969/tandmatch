import "server-only";
import { EmailService, type EmailMessage } from "@/platform/notifications/emailService";
import { NotificationDeliveryError } from "@/platform/notifications/notificationErrors";

// Til tests: gemmer beskederne på instansen (ingen modul-tilstand) og kan sættes til at fejle.
export class FakeEmailService extends EmailService {
  readonly sent: EmailMessage[] = [];

  constructor(private failWith: { code: string; retryable: boolean } | null = null) {
    super();
  }

  fail(error: { code: string; retryable: boolean } | null): void {
    this.failWith = error;
  }

  protected async deliver(message: EmailMessage): Promise<void> {
    if (this.failWith) throw new NotificationDeliveryError(this.failWith.code, this.failWith.retryable);
    this.sent.push(message);
  }
}
