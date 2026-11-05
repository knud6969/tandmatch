import "server-only";
import { EmailService, type EmailMessage } from "@/platform/notifications/emailService";

// Standard i udvikling (uden RESEND_API_KEY/EMAIL_FROM): logger kun type, klinik-id og outbox-id. Aldrig adresse, emne, tekst eller link.
export class ConsoleEmailService extends EmailService {
  protected async deliver(message: EmailMessage): Promise<void> {
    console.info(`[email] ${message.type} til ${message.recipient.kind === "clinic" ? "klinik" : "patient"} ${message.recipient.id} (outbox ${message.idempotencyKey})`);
  }
}
