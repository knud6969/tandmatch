import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius, spacing } from "~/theme";

// Kort med bløde hjørner og tynd kant; bruges til alt grupperet indhold.
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
