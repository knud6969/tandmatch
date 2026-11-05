import { useRouter } from "expo-router";
import { NotificationBell } from "~/components/notifications/notification-bell";
import { useUnreadNotifications } from "~/hooks/use-unread-notifications";

// Klokken øverst på Forside og Mine sager: vises kun for patienter med konto og åbner /notifikationer.
export function NotificationBellSlot() {
  const router = useRouter();
  const { visible, unread } = useUnreadNotifications();
  if (!visible) return null;
  return <NotificationBell unread={unread} onPress={() => router.push("/notifikationer")} />;
}
