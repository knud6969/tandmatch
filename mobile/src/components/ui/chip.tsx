import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";

type Props = { label: string; selected: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string };

// Valgbar pille (filtre og sortering). Mindst 44 pt høj.
export function Chip({ label, selected, onPress, disabled = false, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}
    >
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  disabled: { opacity: 0.45 },
  text: { fontSize: fontSize.sm, fontWeight: "600", color: colors.ink },
  textSelected: { color: colors.onBrand },
});
