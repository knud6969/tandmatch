import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, MIN_TOUCH, spacing, type } from "~/theme";
import { formatDateTime } from "~/utils/format";

type Props = { expiresAt: string | null; onCreateAccount: () => void };

// Tynd linje for en anonym session: samtalen er en kladde, der forsvinder, medmindre den gemmes på en konto.
export function AnonymousBanner({ expiresAt, onCreateAccount }: Props) {
  return (
    <View style={styles.bar} accessibilityRole="summary">
      <Text style={[type.caption, styles.text]}>
        Du bruger TandMatch uden konto{expiresAt ? `. Din samtale slettes ${formatDateTime(expiresAt)}` : ""}.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Opret konto" onPress={onCreateAccount} style={styles.action} hitSlop={4}>
        <Text style={styles.actionText}>Opret konto</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  text: { flex: 1 },
  action: { minHeight: MIN_TOUCH, justifyContent: "center" },
  actionText: { fontSize: 14, fontWeight: "600", color: colors.brand700 },
});
