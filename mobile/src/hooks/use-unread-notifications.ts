import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { INBOX_POLL_MS } from "@/lib/common/constants/notifications";
import { getInbox } from "~/api/notifications";
import { useSession } from "~/auth/session-context";
import { useFocusPolling } from "~/hooks/use-polling";

// Antal ulæste notifikationer til klokken (mobile 13.10, platform 14.11). Kun for patienter med konto. Hentes, når skærmen får
// fokus, og hvert 30. sekund, mens skærmen er i fokus og appen i forgrunden. Fejl beholder det seneste tal.
export function useUnreadNotifications(): { visible: boolean; unread: number } {
  const { status } = useSession();
  const [unread, setUnread] = useState(0);
  const refresh = useCallback(async () => {
    if (status !== "account") return;
    try {
      setUnread((await getInbox()).unreadCount);
    } catch {
      // Næste hentning prøver igen.
    }
  }, [status]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useFocusPolling(refresh, INBOX_POLL_MS);
  return { visible: status === "account", unread };
}
