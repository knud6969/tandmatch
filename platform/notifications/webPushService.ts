import "server-only";
import type { PushData } from "@/lib/common/types/notifications";
import type { DeliveryResult } from "@/platform/notifications/notificationErrors";

export type WebPushTarget = { endpoint: string; p256dh: string; auth: string };

// Indholdet er en generisk tekst og en intern sti, aldrig helbredsdata, navne eller beskedtekst (platform 14.2).
// `clinicId` bruges kun til logning.
export type WebPushMessage = { to: WebPushTarget; title: string; body: string; data: PushData; clinicId?: string };

// Abstrakt web push-tjeneste til klinikejerens browser (platform 14.6). Samme mønster som PushService.
export abstract class WebPushService {
  protected abstract deliver(messages: WebPushMessage[]): Promise<DeliveryResult[]>;

  async send(messages: WebPushMessage[]): Promise<DeliveryResult[]> {
    if (messages.length === 0) return [];
    const results = await this.deliver(messages);
    if (results.length !== messages.length) throw new Error("web push: antal resultater passer ikke");
    return results;
  }
}
