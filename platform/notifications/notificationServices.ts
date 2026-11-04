import "server-only";
import { ConsoleEmailService } from "@/platform/notifications/consoleEmailService";
import { ConsolePushService } from "@/platform/notifications/consolePushService";
import { ConsoleWebPushService } from "@/platform/notifications/consoleWebPushService";
import type { EmailService } from "@/platform/notifications/emailService";
import { ExpoPushService } from "@/platform/notifications/expoPushService";
import { FakeEmailService } from "@/platform/notifications/fakeEmailService";
import { FakePushService } from "@/platform/notifications/fakePushService";
import { FakeWebPushService } from "@/platform/notifications/fakeWebPushService";
import type { PushService } from "@/platform/notifications/pushService";
import { ResendEmailService } from "@/platform/notifications/resendEmailService";
import { VapidWebPushService } from "@/platform/notifications/vapidWebPushService";
import type { WebPushService } from "@/platform/notifications/webPushService";

// Vælger tjenesterne (platform 14.6). TEST-MULIGHED: NOTIFICATIONS_FAKE=1 giver fakes uden netværkskald, men kun uden for
// produktion (som GEOCODING_FAKE). Variablen sættes af tests/api/run.sh og tests/e2e/run.sh.
function fake(): boolean {
  return process.env.NOTIFICATIONS_FAKE === "1" && process.env.NODE_ENV !== "production";
}

export function createEmailService(): EmailService {
  if (fake()) return new FakeEmailService();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (apiKey && from) return new ResendEmailService(apiKey, from);
  if (process.env.NODE_ENV === "production") console.warn("E-mail: RESEND_API_KEY eller EMAIL_FROM mangler; e-mails logges kun.");
  return new ConsoleEmailService();
}

export function createPushService(): PushService {
  if (fake()) return new FakePushService();
  // PUSH_LOG_ONLY=1: send ingen push til Expo, log kun type og antal (til udvikling uden telefon).
  if (process.env.PUSH_LOG_ONLY === "1") return new ConsolePushService();
  return new ExpoPushService(process.env.EXPO_ACCESS_TOKEN || undefined);
}

export function createWebPushService(): WebPushService {
  if (fake()) return new FakeWebPushService();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (publicKey && privateKey && subject) {
    try {
      return new VapidWebPushService({ publicKey, privateKey, subject });
    } catch {
      console.warn("Web push: VAPID-nøglerne er ugyldige; web push logges kun.");
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn("Web push: VAPID-nøgler mangler; web push logges kun.");
  }
  return new ConsoleWebPushService();
}
