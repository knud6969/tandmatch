import "server-only";
import { NotificationDeliveryError } from "@/platform/notifications/notificationErrors";
import { SmsService, type SmsMessage } from "@/platform/notifications/smsService";

// Til tests: gemmer beskederne på instansen (ingen modul-tilstand) og kan sættes til at fejle.
export class FakeSmsService extends SmsService {
  readonly sent: SmsMessage[] = [];

  constructor(private failWith: { code: string; retryable: boolean } | null = null) {
    super();
  }

  fail(error: { code: string; retryable: boolean } | null): void {
    this.failWith = error;
  }

  protected async deliver(message: SmsMessage): Promise<void> {
    if (this.failWith) throw new NotificationDeliveryError(this.failWith.code, this.failWith.retryable);
    this.sent.push(message);
  }
}
