import "server-only";
import type { PushData } from "@/lib/common/types/notifications";
import type { DeliveryResult } from "@/platform/notifications/notificationErrors";

// `recipientId` bruges kun til logning (patientens bruger-id); sendes ikke til push-tjenesten.
export type PushMessage = { to: string; title: string; body: string; data: PushData; recipientId?: string };

// Abstrakt push-tjeneste til patientens app (platform 14.6). Returnerer ét resultat pr. besked i samme rækkefølge.
export abstract class PushService {
  protected abstract deliver(messages: PushMessage[]): Promise<DeliveryResult[]>;

  async send(messages: PushMessage[]): Promise<DeliveryResult[]> {
    if (messages.length === 0) return [];
    const results = await this.deliver(messages);
    if (results.length !== messages.length) throw new Error("push: antal resultater passer ikke");
    return results;
  }
}
