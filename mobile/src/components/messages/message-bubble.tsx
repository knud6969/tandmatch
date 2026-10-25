import { StyleSheet, Text, View } from "react-native";
import type { MessageDto } from "@/lib/leads/types/messages";
import { colors, fontSize, radius, spacing, type } from "~/theme";
import { formatShortDateTime } from "@/lib/common/domain/format";
import { senderLabel } from "~/utils/message-view";

// Én besked i tråden. Patientens egne står til højre i blåt, klinikkens til venstre; afsender og tid står over teksten.
export function MessageBubble({ message }: { message: MessageDto }) {
  const mine = message.fromMe;
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]} accessible accessibilityLabel={`${senderLabel(message)}, ${formatShortDateTime(message.createdAt)}: ${message.body}`}>
        <Text style={[styles.meta, mine && styles.metaMine]}>
          {senderLabel(message)} · {formatShortDateTime(message.createdAt)}
        </Text>
        <Text selectable style={[styles.text, mine && styles.textMine]}>
          {message.body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  mine: { backgroundColor: colors.brand600, borderBottomRightRadius: radius.sm },
  theirs: { backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: radius.sm },
  meta: { ...type.caption, fontSize: fontSize.xs },
  metaMine: { color: colors.brand100 },
  text: { fontSize: fontSize.md, lineHeight: 22, color: colors.ink },
  textMine: { color: colors.onBrand },
});
