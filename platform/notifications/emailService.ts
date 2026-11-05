import "server-only";
import type { NotificationType } from "@/lib/common/types/notifications";
import { NotificationDeliveryError } from "@/platform/notifications/notificationErrors";

// `type`, `recipient` (klinik eller patient, kun id) og `idempotencyKey` (outbox-rækkens id) bruges kun til logning og idempotens, aldrig i indholdet.
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  type: NotificationType;
  recipient: { kind: "clinic" | "patient"; id: string };
};

const EMAIL_RE = /^[^\s@<>,;"]{1,64}@[^\s@<>,;"]{1,255}$/;

// Abstrakt e-mailtjeneste (platform 14.6). Basisklassen validerer og kalder underklassen; fejl kastes som
// NotificationDeliveryError, så dispatcheren kan vælge retry eller failed.
export abstract class EmailService {
  protected abstract deliver(message: EmailMessage): Promise<void>;

  async send(message: EmailMessage): Promise<void> {
    if (!EMAIL_RE.test(message.to)) throw new NotificationDeliveryError("INVALID_RECIPIENT", false);
    if (!message.subject || message.subject.length > 200 || /[\r\n]/.test(message.subject)) throw new NotificationDeliveryError("INVALID_MESSAGE", false);
    if (!message.text || !message.html) throw new NotificationDeliveryError("INVALID_MESSAGE", false);
    await this.deliver(message);
  }
}
