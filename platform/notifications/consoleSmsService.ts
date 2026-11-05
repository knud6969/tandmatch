import "server-only";
import { SmsService, type SmsMessage } from "@/platform/notifications/smsService";

// Standard (ingen SMS-udbyder): logger kun type, patient-id og outbox-id. Aldrig nummer eller tekst.
export class ConsoleSmsService extends SmsService {
  protected async deliver(message: SmsMessage): Promise<void> {
    console.info(`[sms] ${message.type} til patient ${message.patientId} (outbox ${message.idempotencyKey})`);
  }
}
