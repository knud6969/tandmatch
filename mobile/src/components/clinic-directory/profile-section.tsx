import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "~/theme";

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
});
