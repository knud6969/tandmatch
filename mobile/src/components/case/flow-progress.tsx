import { StyleSheet, Text, View } from "react-native";
import type { CaseFlowStep } from "@/lib/cases/types/cases";
import { colors, radius, spacing, type } from "~/theme";
import { FLOW_PROGRESS_LABELS, flowProgress } from "~/utils/case-cards";

// Fem trin i samtalen (13.9). Kun visuel: trinnet kommer fra flowStepForApp() og læses her, intet ændres.
// Trin, der er besvaret, er udfyldt; det aktuelle er også udfyldt. Når alt er besvaret, står der "Klar".
export function FlowProgress({ step }: { step: CaseFlowStep }) {
  const { done, label, ready } = flowProgress(step);
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={ready ? "Klar" : `Trin ${label}`}
      accessibilityValue={{ min: 0, max: FLOW_PROGRESS_LABELS.length, now: done }}
    >
      <View style={styles.bars}>
        {FLOW_PROGRESS_LABELS.map((name, i) => (
          <View key={name} style={[styles.bar, ready || i <= done ? styles.barOn : null]} />
        ))}
      </View>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  bars: { flexDirection: "row", gap: spacing.xs },
  bar: { flex: 1, height: 3, borderRadius: radius.pill, backgroundColor: colors.line },
  barOn: { backgroundColor: colors.brand600 },
});
