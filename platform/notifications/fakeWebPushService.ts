import "server-only";
import type { DeliveryResult } from "@/platform/notifications/notificationErrors";
import { WebPushService, type WebPushMessage } from "@/platform/notifications/webPushService";

// Til tests: gemmer beskederne på instansen. `results` kan angive udfaldet pr. endpoint (standard: ok).
export class FakeWebPushService extends WebPushService {
  readonly sent: WebPushMessage[] = [];

  constructor(private readonly results: Record<string, DeliveryResult> = {}) {
    super();
  }

  protected async deliver(messages: WebPushMessage[]): Promise<DeliveryResult[]> {
    this.sent.push(...messages);
    return messages.map((m) => this.results[m.to.endpoint] ?? { status: "ok" });
  }
}
