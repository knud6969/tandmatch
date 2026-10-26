import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { MESSAGE_IMAGES_DELETED_TEXT } from "@/lib/leads/constants/messages";
import { isEmptyMessage } from "@/lib/leads/domain/messages";
import type { MessageDto } from "@/lib/leads/types/messages";
import { colors, fontSize, radius, spacing, type } from "~/theme";
import { formatShortDateTime } from "@/lib/common/domain/format";
import { senderLabel } from "~/utils/message-view";

const THUMB = 96;

// Én besked i tråden. Patientens egne står til højre i blåt, klinikkens til venstre; afsender og tid står over teksten.
// Billeder vises som miniaturer i boblen; et tryk åbner billedet i fuld skærm (onOpenImage).
export function MessageBubble({ message, onOpenImage }: { message: MessageDto; onOpenImage?: (index: number) => void }) {
  const mine = message.fromMe;
  const from = mine ? "fra dig" : "fra klinikken";
  const summary = [message.body, message.images.length > 0 ? `${message.images.length} billede${message.images.length === 1 ? "" : "r"}` : ""].filter(Boolean).join(", ");
  const label = `${senderLabel(message)}, ${formatShortDateTime(message.createdAt)}: ${summary || MESSAGE_IMAGES_DELETED_TEXT}`;
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {/* Uden billeder læses boblen som ét element (som før); med billeder skal miniaturerne kunne vælges hver for sig. */}
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]} testID="besked" accessible={message.images.length === 0} accessibilityLabel={message.images.length === 0 ? label : undefined}>
        <Text style={[styles.meta, mine && styles.metaMine]} accessibilityLabel={message.images.length > 0 ? label : undefined}>
          {senderLabel(message)} · {formatShortDateTime(message.createdAt)}
        </Text>
        {message.images.length > 0 ? (
          <View style={styles.images}>
            {message.images.map((image, index) => (
              <Pressable
                key={image.id}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Vis billede ${index + 1} ${from} i fuld skærm`}
                onPress={() => onOpenImage?.(index)}
                testID="besked-billede"
              >
                <Image source={{ uri: image.url }} style={styles.thumb} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {message.body !== "" ? (
          <Text selectable style={[styles.text, mine && styles.textMine]}>
            {message.body}
          </Text>
        ) : null}
        {isEmptyMessage(message) ? <Text style={[styles.deleted, mine && styles.textMine]}>{MESSAGE_IMAGES_DELETED_TEXT}</Text> : null}
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
  images: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingVertical: spacing.xs },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md, backgroundColor: colors.surface },
  text: { fontSize: fontSize.md, lineHeight: 22, color: colors.ink },
  textMine: { color: colors.onBrand },
  deleted: { fontSize: fontSize.sm, fontStyle: "italic", color: colors.inkMuted },
});
