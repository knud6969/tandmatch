import "server-only";
import { PushService, type PushMessage } from "@/platform/notifications/pushService";
import type { DeliveryResult } from "@/platform/notifications/notificationErrors";

// Standard i udvikling: logger kun type, modtager-id og antal tokens. Aldrig tokens eller tekst.
export class ConsolePushService extends PushService {
  protected async deliver(messages: PushMessage[]): Promise<DeliveryResult[]> {
    const first = messages[0];
    console.info(`[push] ${first.data.type} til patient ${first.recipientId ?? "ukendt"} (${messages.length} enheder)`);
    return messages.map(() => ({ status: "ok" }));
  }
}
