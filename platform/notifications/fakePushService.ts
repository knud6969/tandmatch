import "server-only";
import { PushService, type PushMessage } from "@/platform/notifications/pushService";
import type { DeliveryResult } from "@/platform/notifications/notificationErrors";

// Til tests: gemmer beskederne på instansen. `results` kan angive udfaldet pr. token (standard: ok).
export class FakePushService extends PushService {
  readonly sent: PushMessage[] = [];

  constructor(private readonly results: Record<string, DeliveryResult> = {}) {
    super();
  }

  protected async deliver(messages: PushMessage[]): Promise<DeliveryResult[]> {
    this.sent.push(...messages);
    return messages.map((m) => this.results[m.to] ?? { status: "ok" });
  }
}
