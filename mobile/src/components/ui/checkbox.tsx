import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";

type Props = { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; accessibilityLabel: string };

export function Checkbox({ checked, onChange, children, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
      <View style={styles.text}>{children}</View>
    </Pressable>
  );
}

export function CheckboxText({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: MIN_TOUCH },
  box: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.fieldBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  boxChecked: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  tick: { color: colors.onBrand, fontWeight: "700", fontSize: fontSize.md },
  text: { flex: 1 },
  label: { fontSize: fontSize.md, color: colors.ink },
});
