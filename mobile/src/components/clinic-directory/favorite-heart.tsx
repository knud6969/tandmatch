import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, iconSize, MIN_TOUCH } from "~/theme";
import { favoriteLabel } from "~/utils/favorites";

type Props = { saved: boolean; onToggle: () => void; clinicName: string };

// Hjertet til at gemme en klinik: mindst 44 x 44 pt, læses op som "Gem klinik" / "Fjern fra gemte" (mobile 13.12).
export function FavoriteHeart({ saved, onToggle, clinicName }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${favoriteLabel(saved)}: ${clinicName}`}
      accessibilityState={{ selected: saved }}
      onPress={onToggle}
      style={styles.heart}
    >
      <Ionicons name={saved ? "heart" : "heart-outline"} size={iconSize.md} color={saved ? colors.brand700 : colors.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heart: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
});
