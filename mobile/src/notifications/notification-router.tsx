import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { useSession } from "~/auth/session-context";
import { notificationTarget, planNotificationNavigation } from "~/utils/notification-routing";
import { registerOnStart } from "./push";

// Ligger i rodlayoutet (mobile 13.10): åbner den rigtige skærm, når patienten trykker på en notifikation (også ved kold start),
// og registrerer push-tokenet ved app-start for en patient med konto. Rendrer intet.
export function NotificationRouter() {
  const router = useRouter();
  const { status } = useSession();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (status === "account") void registerOnStart();
  }, [status]);

  useEffect(() => {
    if (status === "loading") return;
    let tapped: string | null = null;
    const id = response?.notification.request.identifier ?? null;
    if (response && id !== handled.current && response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      handled.current = id;
      tapped = notificationTarget(response.notification.request.content.data);
    }
    const plan = planNotificationNavigation({ tapped, pending: pending.current, signedIn: status === "account" });
    pending.current = plan.pending;
    if (plan.navigate) router.push(plan.navigate as never);
  }, [response, status, router]);

  return null;
}
