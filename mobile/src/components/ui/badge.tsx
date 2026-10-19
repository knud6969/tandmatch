import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "~/theme";

type Tone = "info" | "success" | "warning" | "danger";
const TONES: Record<Tone, { bg: string; line: string; ink: string }> = {
  info: { bg: colors.infoBg, line: colors.infoLine, ink: colors.brand800 },
  success: { bg: colors.successBg, line: colors.successLine, ink: colors.successInk },
  warning: { bg: colors.warningBg, line: colors.warningLine, ink: colors.warningInk },
  danger: { bg: colors.dangerBg, line: colors.dangerLine, ink: colors.dangerInk },
};

export function Badge({ label, tone = "info" }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.line }]}>
      <Text style={[styles.text, { color: t.ink }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: { fontSize: fontSize.sm, fontWeight: "600" },
});
