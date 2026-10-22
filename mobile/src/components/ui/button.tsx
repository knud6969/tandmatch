import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
};

// Fælles knap. Primær er udfyldt, sekundær er omrids. Under indlæsning er den deaktiveret, så der ikke trykkes to gange.
export function Button({ label, onPress, variant = "primary", disabled = false, loading = false, accessibilityLabel }: Props) {
  const inactive = disabled || loading;
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.onBrand : colors.brand700} />
      ) : (
        <Text style={[styles.label, primary ? styles.labelPrimary : styles.labelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.brand600 },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand600 },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontSize: fontSize.md, fontWeight: "600" },
  labelPrimary: { color: colors.onBrand },
  labelSecondary: { color: colors.brand700 },
});
