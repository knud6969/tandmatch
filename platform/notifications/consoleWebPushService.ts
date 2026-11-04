import "server-only";
import type { DeliveryResult } from "@/platform/notifications/notificationErrors";
import { WebPushService, type WebPushMessage } from "@/platform/notifications/webPushService";

// Standard uden VAPID-nøgler: logger kun type, klinik-id og antal browsere. Aldrig adresser, nøgler eller tekst.
export class ConsoleWebPushService extends WebPushService {
  protected async deliver(messages: WebPushMessage[]): Promise<DeliveryResult[]> {
    const first = messages[0];
    console.info(`[web-push] ${first.data.type} til klinik ${first.clinicId ?? "ukendt"} (${messages.length} browsere)`);
    return messages.map(() => ({ status: "ok" }));
  }
}
