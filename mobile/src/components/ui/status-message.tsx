import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "~/theme";

type Tone = "info" | "success" | "warning" | "danger";
const TONES: Record<Tone, { bg: string; line: string; ink: string }> = {
  info: { bg: colors.infoBg, line: colors.infoLine, ink: colors.ink },
  success: { bg: colors.successBg, line: colors.successLine, ink: colors.successInk },
  warning: { bg: colors.warningBg, line: colors.warningLine, ink: colors.warningInk },
  danger: { bg: colors.dangerBg, line: colors.dangerLine, ink: colors.dangerInk },
};

export function StatusMessage({ message, tone = "info" }: { message: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      style={[styles.box, { backgroundColor: t.bg, borderColor: t.line }]}
    >
      <Text style={[styles.text, { color: t.ink }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  text: { fontSize: fontSize.md },
});
