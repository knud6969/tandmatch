import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { INBOX_EMPTY_TEXT, INBOX_HEADING, INBOX_MARK_ALL_READ, INBOX_POLL_MS } from "@/lib/common/constants/notifications";
import { formatNotificationAge } from "@/lib/common/domain/notifications";
import type { NotificationItemDto } from "@/lib/common/types/notifications";
import { getInbox, markNotificationsRead } from "~/api/notifications";
import { BackLink, Button, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { useFocusPolling } from "~/hooks/use-polling";
import { useReloadOnFocus } from "~/hooks/use-reload-on-focus";
import { AccountRequired } from "~/screens/account-required";
import { colors, MIN_TOUCH, radius, spacing, type } from "~/theme";
import { inboxItemTarget, needsMarking } from "~/utils/notification-inbox";

function Row({ item, onPress }: { item: NotificationItemDto; onPress: () => void }) {
  const unread = item.readAt === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Ulæst. " : ""}${item.title}${item.body ? `. ${item.body}` : ""}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.dot, unread ? styles.dotUnread : null]} />
      <View style={styles.text}>
        <Text style={[type.label, unread ? null : styles.read]}>{item.title}</Text>
        {item.body ? <Text style={type.caption}>{item.body}</Text> : null}
        <Text style={type.caption}>{formatNotificationAge(item.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

// Klokkens liste (mobile 13.10, platform 14.11): de nyeste, tryk åbner skærmen og markerer som læst, og "Marker alle som læst".
function NotificationsContent() {
  const router = useRouter();
  const inbox = useLoad(getInbox);
  useReloadOnFocus(inbox.reload);
  useFocusPolling(inbox.reload, INBOX_POLL_MS);
  const markAll = useCallback(async () => {
    await markNotificationsRead();
    inbox.reload();
  }, [inbox]);
  const { run: runMarkAll, pending, error } = useAction(markAll);

  function open(item: NotificationItemDto) {
    if (needsMarking(item)) void markNotificationsRead([item.id]).catch(() => undefined);
    router.push(inboxItemTarget(item) as never);
  }

  return (
    <Screen>
      <BackLink label="Tilbage" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <Text accessibilityRole="header" style={type.screenTitle}>
        {INBOX_HEADING}
      </Text>
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      <LoadState {...inbox} onRetry={inbox.reload}>
        {({ items, unreadCount }) => (
          <View style={styles.list}>
            {unreadCount > 0 ? <Button label={INBOX_MARK_ALL_READ} variant="secondary" loading={pending} onPress={() => void runMarkAll()} /> : null}
            {items.length === 0 ? <Text style={type.body}>{INBOX_EMPTY_TEXT}</Text> : items.map((item) => <Row key={item.id} item={item} onPress={() => open(item)} />)}
          </View>
        )}
      </LoadState>
    </Screen>
  );
}

export function NotificationsScreen() {
  return (
    <AccountRequired title="Log ind for at se dine notifikationer">
      <NotificationsContent />
    </AccountRequired>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 7, backgroundColor: "transparent" },
  dotUnread: { backgroundColor: colors.brand700 },
  text: { flex: 1, gap: 2 },
  read: { fontWeight: "400", color: colors.inkMuted },
});
