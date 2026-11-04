import "server-only";
import { EmailService, type EmailMessage } from "@/platform/notifications/emailService";
import { NotificationDeliveryError, toErrorCode } from "@/platform/notifications/notificationErrors";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 5000;

// E-mail via Resends HTTP API (ingen npm-pakke). Svarets indhold logges og gemmes aldrig.
export class ResendEmailService extends EmailService {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }

  protected async deliver(message: EmailMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Timeout og netværksfejl: prøves igen.
      throw new NotificationDeliveryError("RESEND_NETWORK", true);
    }
    if (response.ok) return;
    await response.body?.cancel().catch(() => undefined); // svaret læses ikke
    throw new NotificationDeliveryError(toErrorCode("RESEND", response.status), response.status === 429 || response.status >= 500);
  }
}
