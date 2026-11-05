import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, iconSize, MIN_TOUCH } from "~/theme";
import { bellBadge, bellLabel } from "~/utils/notification-inbox";

// Klokken (mobile 13.10, platform 14.11): tal for ulæste og et tryk til listen. Får tal og handling som props.
export function NotificationBell({ unread, onPress }: { unread: number; onPress: () => void }) {
  const badge = bellBadge(unread);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={bellLabel(unread)} onPress={onPress} hitSlop={8} style={styles.button}>
      <Ionicons name="notifications-outline" size={iconSize.md + 4} color={colors.ink} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.brand700,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: colors.onBrand, fontSize: fontSize.xs, fontWeight: "700" },
});
