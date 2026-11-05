import "server-only";
import type { NotificationType } from "@/lib/common/types/notifications";
import { NotificationDeliveryError } from "@/platform/notifications/notificationErrors";

// `type`, `patientId` og `idempotencyKey` (outbox-rækkens id) bruges kun til logning og idempotens, aldrig i indholdet.
export type SmsMessage = {
  to: string;
  body: string;
  idempotencyKey: string;
  type: NotificationType;
  patientId: string;
};

const PHONE_RE = /^[+0-9 ()-]{6,20}$/;
const MAX_BODY = 320; // to SMS-segmenter

// Abstrakt SMS-tjeneste (platform 14.12), samme mønster som EmailService. Der er ingen rigtig udbyder endnu; standarden er
// ConsoleSmsService. Basisklassen validerer og kalder underklassen; fejl kastes som NotificationDeliveryError.
export abstract class SmsService {
  protected abstract deliver(message: SmsMessage): Promise<void>;

  async send(message: SmsMessage): Promise<void> {
    if (!PHONE_RE.test(message.to) || (message.to.match(/\d/g) ?? []).length < 8) throw new NotificationDeliveryError("INVALID_RECIPIENT", false);
    if (!message.body || message.body.length > MAX_BODY) throw new NotificationDeliveryError("INVALID_MESSAGE", false);
    await this.deliver(message);
  }
}
