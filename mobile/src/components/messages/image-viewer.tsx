import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { MessageImageDto } from "@/lib/leads/types/messages";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";

const ICON = 28;

type Props = {
  images: MessageImageDto[];
  // Det viste billede; null = lukket.
  index: number | null;
  onChange: (index: number) => void;
  onClose: () => void;
  // Fx "fra klinikken" eller "fra dig" til skærmlæseren.
  from: string;
};

// Et billede fra beskedtråden i fuld skærm (10.12). Luk-knap øverst, forrige og næste, når beskeden har flere billeder.
// Android-tilbageknappen lukker også.
export function ImageViewer({ images, index, onChange, onClose, from }: Props) {
  const image = index !== null ? images[index] : undefined;
  return (
    <Modal visible={image !== undefined} animationType="fade" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.count}>{index !== null && images.length > 1 ? `${index + 1} af ${images.length}` : ""}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Luk billedet" onPress={onClose} style={styles.button} hitSlop={8} testID="luk-billede">
            <Ionicons name="close" size={ICON} color={colors.onBrand} />
          </Pressable>
        </View>
        {image ? (
          <Image source={{ uri: image.url }} resizeMode="contain" style={styles.image} accessibilityLabel={`Billede ${index! + 1} ${from}`} />
        ) : null}
        {index !== null && images.length > 1 ? (
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" accessibilityLabel="Forrige billede" onPress={() => onChange((index + images.length - 1) % images.length)} style={styles.button}>
              <Ionicons name="chevron-back" size={ICON} color={colors.onBrand} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Næste billede" onPress={() => onChange((index + 1) % images.length)} style={styles.button}>
              <Ionicons name="chevron-forward" size={ICON} color={colors.onBrand} />
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  count: { fontSize: fontSize.md, color: colors.onBrand },
  button: { width: MIN_TOUCH + 4, height: MIN_TOUCH + 4, alignItems: "center", justifyContent: "center", borderRadius: radius.lg },
  image: { flex: 1, width: "100%" },
  footer: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
