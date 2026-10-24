import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusMessage } from "~/components/ui";
import { colors, fontSize, iconSize, MIN_TOUCH, radius, spacing } from "~/theme";
import { qualityNotice, type ChatImageItem } from "~/utils/chat-images";

type Props = {
  item: ChatImageItem;
  index: number;
  onDelete: () => void;
  onRetry: () => void;
};

// Patientens billede som en boble til højre i chatten, med upload-status, slet-knap og AI'ens kvalitetsfeedback (hvis API'et giver en).
export function ImageBubble({ item, index, onDelete, onRetry }: Props) {
  const feedback = qualityNotice(item.quality);
  return (
    <View style={styles.row} testID="billedboble">
      <View style={styles.bubble}>
        <View>
          <Image source={{ uri: item.uri }} accessibilityLabel={`Dit billede ${index + 1}`} style={styles.image} />
          {item.status === "uploading" ? (
            <View style={styles.overlay} accessibilityRole="progressbar" accessibilityLabel="Billedet sendes">
              <ActivityIndicator color={colors.onBrand} />
            </View>
          ) : null}
        </View>
        <View style={styles.footer}>
          <Text style={styles.status}>{item.status === "uploading" ? "Sender …" : item.status === "failed" ? "Ikke sendt" : "Sendt"}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Slet billede ${index + 1}`}
            hitSlop={8}
            onPress={onDelete}
            disabled={item.status === "uploading"}
            style={styles.delete}
          >
            <Ionicons name="trash-outline" size={iconSize.md} color={colors.onBrand} />
          </Pressable>
        </View>
        {item.error ? (
          <View style={styles.notice}>
            <StatusMessage message={item.error} tone="danger" />
            <Pressable accessibilityRole="button" accessibilityLabel="Send billedet igen" onPress={onRetry} style={styles.retry}>
              <Text style={styles.retryText}>Prøv igen</Text>
            </Pressable>
          </View>
        ) : null}
        {feedback ? (
          <View style={styles.notice} testID="billedfeedback">
            <StatusMessage message={feedback} tone="warning" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "flex-end" },
  bubble: { width: "72%", backgroundColor: colors.brand600, borderRadius: radius.lg, borderBottomRightRadius: radius.sm, padding: spacing.sm, gap: spacing.sm },
  image: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  overlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(22,32,51,0.45)", borderRadius: radius.md },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: spacing.xs },
  status: { fontSize: fontSize.sm, color: colors.onBrand },
  delete: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  notice: { gap: spacing.xs },
  retry: { minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface },
  retryText: { fontSize: fontSize.md, fontWeight: "600", color: colors.brand700 },
});
