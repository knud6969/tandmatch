import "server-only";
import type { KeyObject } from "node:crypto";
import { isAllowedWebPushEndpoint } from "@/lib/clinics/domain/web-push";
import { toErrorCode, type DeliveryResult } from "@/platform/notifications/notificationErrors";
import { createVapidAuthorization, createVapidPrivateKey, base64UrlDecode, encryptWebPushPayload } from "@/platform/notifications/webPushCrypto";
import { WebPushService, type WebPushMessage } from "@/platform/notifications/webPushService";

const TIMEOUT_MS = 5000;
const TTL_SECONDS = 24 * 60 * 60;

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

// Web push efter RFC 8030, 8291 og 8292 med Nodes crypto og fetch (ingen npm-pakke).
export class VapidWebPushService extends WebPushService {
  private readonly key: KeyObject;

  constructor(
    private readonly config: VapidConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
    this.key = createVapidPrivateKey(config.privateKey, config.publicKey);
  }

  protected async deliver(messages: WebPushMessage[]): Promise<DeliveryResult[]> {
    return Promise.all(messages.map((message) => this.sendOne(message)));
  }

  private async sendOne(message: WebPushMessage): Promise<DeliveryResult> {
    const { endpoint, p256dh, auth } = message.to;
    // Også lige før afsendelsen: serveren kalder kun kendte push-tjenester (SSRF).
    if (!isAllowedWebPushEndpoint(endpoint)) return { status: "invalid_target" };
    let body: Buffer;
    try {
      const plaintext = Buffer.from(JSON.stringify({ title: message.title, body: message.body, path: message.data.path, type: message.data.type }), "utf8");
      body = encryptWebPushPayload({ plaintext, userPublicKey: base64UrlDecode(p256dh), authSecret: base64UrlDecode(auth) });
    } catch {
      // Ugyldige nøgler i abonnementet: det kan aldrig lykkes.
      return { status: "invalid_target" };
    }
    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: createVapidAuthorization({
            audience: new URL(endpoint).origin,
            subject: this.config.subject,
            privateKey: this.key,
            publicKeyBase64Url: this.config.publicKey,
          }),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: String(TTL_SECONDS),
          Urgency: "normal",
        },
        body: new Uint8Array(body),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { status: "error", code: "WEBPUSH_NETWORK", retryable: true };
    }
    await response.body?.cancel().catch(() => undefined); // svaret læses aldrig
    if (response.status >= 200 && response.status < 300) return { status: "ok" };
    if (response.status === 404 || response.status === 410) return { status: "invalid_target" };
    return { status: "error", code: toErrorCode("WEBPUSH", response.status), retryable: response.status === 429 || response.status >= 500 };
  }
}
