import { isAllowedNotificationPath } from "@/lib/common/domain/notifications";

// Hvor et tryk på en notifikation fører hen (mobile 13.10). Ren logik uden expo-notifications, så den kan testes.
export const NOTIFICATION_FALLBACK_PATH = "/sager"; // Mine sager

// Stien fra notifikationens data, kun hvis den er på listen over tilladte stier; ellers Mine sager.
export function notificationTarget(data: unknown): string {
  const path = typeof data === "object" && data !== null ? (data as { path?: unknown }).path : undefined;
  return isAllowedNotificationPath(path) ? path : NOTIFICATION_FALLBACK_PATH;
}

// Hvad der skal ske nu: åbn skærmen, hvis patienten er logget ind med konto; ellers husk stien, til patienten er det.
// `tapped` er stien fra et nyt tryk (null, hvis der ikke er et nyt), `pending` en tidligere gemt sti.
export function planNotificationNavigation(input: { tapped: string | null; pending: string | null; signedIn: boolean }): {
  navigate: string | null;
  pending: string | null;
} {
  const target = input.tapped ?? input.pending;
  if (target === null) return { navigate: null, pending: null };
  return input.signedIn ? { navigate: target, pending: null } : { navigate: null, pending: target };
}
