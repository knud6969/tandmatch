import "server-only";
import { PushService, type PushMessage } from "@/platform/notifications/pushService";
import { toErrorCode, type DeliveryResult } from "@/platform/notifications/notificationErrors";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const TIMEOUT_MS = 5000;
// Fejl hos Expo, hvor et nyt forsøg giver mening.
const RETRYABLE_TICKET_ERRORS = new Set(["MessageRateExceeded"]);

type Ticket = { status?: string; details?: { error?: string } };

// Push via Expos HTTP API (ingen npm-pakke). Kvitteringer (receipts) hentes ikke [UDSKUDT].
export class ExpoPushService extends PushService {
  constructor(
    private readonly accessToken: string | undefined = undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }

  protected async deliver(messages: PushMessage[]): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      results.push(...(await this.sendBatch(messages.slice(i, i + BATCH_SIZE))));
    }
    return results;
  }

  private async sendBatch(batch: PushMessage[]): Promise<DeliveryResult[]> {
    const failAll = (code: string, retryable: boolean): DeliveryResult[] => batch.map(() => ({ status: "error", code, retryable }));
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    let response: Response;
    try {
      response = await this.fetchImpl(EXPO_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(
          batch.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, sound: "default" })),
        ),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return failAll("EXPO_NETWORK", true);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return failAll(toErrorCode("EXPO_HTTP", response.status), response.status === 429 || response.status >= 500);
    }
    let tickets: Ticket[];
    try {
      const json = (await response.json()) as { data?: unknown };
      if (!Array.isArray(json.data) || json.data.length !== batch.length) throw new Error("ugyldigt svar");
      tickets = json.data as Ticket[];
    } catch {
      return failAll("EXPO_BAD_RESPONSE", true);
    }
    return tickets.map((ticket): DeliveryResult => {
      if (ticket?.status === "ok") return { status: "ok" };
      const error = ticket?.details?.error;
      if (error === "DeviceNotRegistered") return { status: "invalid_target" };
      return { status: "error", code: toErrorCode("EXPO", error ?? "ERROR"), retryable: error !== undefined && RETRYABLE_TICKET_ERRORS.has(error) };
    });
  }
}
