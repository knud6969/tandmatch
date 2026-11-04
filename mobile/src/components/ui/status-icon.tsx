import { StyleSheet, Text, View } from "react-native";
import { colors } from "~/theme";

export type Tone = "info" | "success" | "warning" | "danger";

// Farverne pr. tone. Samme tokens som weben (components/ui/alert.tsx); farverne står i theme.ts.
export const TONES: Record<Tone, { bg: string; line: string; ink: string }> = {
  info: { bg: colors.infoBg, line: colors.infoLine, ink: colors.ink },
  success: { bg: colors.successBg, line: colors.successLine, ink: colors.successInk },
  warning: { bg: colors.warningBg, line: colors.warningLine, ink: colors.warningInk },
  danger: { bg: colors.dangerBg, line: colors.dangerLine, ink: colors.dangerInk },
};

const GLYPHS: Record<Tone, string> = { info: "i", success: "✓", warning: "!", danger: "!" };

// Lille rundt statusikon (dekorativt), så en fejl ikke kun adskilles på farve. Samme tegn som weben (status-icon.tsx).
export function StatusIcon({ tone, size = 20 }: { tone: Tone; size?: number }) {
  const t = TONES[tone];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderColor: t.ink }]}
    >
      <Text style={[styles.glyph, { color: t.ink, fontSize: size * 0.65, lineHeight: size * 0.9 }]}>{GLYPHS[tone]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  glyph: { fontWeight: "700", textAlign: "center" },
});
