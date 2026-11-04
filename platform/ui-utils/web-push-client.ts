import { apiRequest } from "@/platform/ui-utils/api-client";

// Browserens del af web push til klinik-weben (clinics 10.19). Kun klientkode; spørger aldrig om tilladelse af sig selv.
const SERVICE_WORKER_URL = "/sw.js";

export type PushSupport = "supported" | "unsupported" | "missing-key";

export function pushSupport(vapidPublicKey: string | undefined): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return vapidPublicKey && vapidPublicKey.trim() !== "" ? "supported" : "missing-key";
}

// VAPID-nøglen er base64url; PushManager vil have bytes.
export function vapidKeyToBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.trim().replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.trim().length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// Browserens nuværende abonnement, hvis der er et (ingen tilladelse bedes om).
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

// Beder om tilladelse (kun kaldt efter et klik), registrerer service workeren, abonnerer og melder abonnementet til serveren.
// Returnerer "denied", hvis klinikken afviser tilladelsen.
export async function subscribeBrowserPush(vapidPublicKey: string): Promise<"subscribed" | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(vapidPublicKey) }));
  const json = subscription.toJSON();
  try {
    await apiRequest<void>("/api/web-push-subscriptions", {
      method: "POST",
      body: { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } },
    });
  } catch (error) {
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return "subscribed";
}

// Afmelder browserens abonnement hos serveren og i browseren. Fejl stopper aldrig kalderen (bruges også ved logud).
export async function unsubscribeBrowserPush(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const subscription = await currentSubscription();
    if (!subscription) return;
    await apiRequest<void>("/api/web-push-subscriptions", { method: "DELETE", body: { endpoint: subscription.endpoint } }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  } catch {
    // Best effort.
  }
}
