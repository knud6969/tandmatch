import { StyleSheet, Text, View } from "react-native";
import type { CaseFlowStep } from "@/lib/cases/types/cases";
import { colors, radius, spacing, type } from "~/theme";

// Fem trin i samtalen (13.9). Kun visuel: trinnet kommer fra flowStepForApp() og læses her, intet ændres.
const LABELS = ["Beskriv", "Behandlinger", "Tidspunkt", "Område", "Beskrivelse"] as const;
const INDEX: Partial<Record<CaseFlowStep, number>> = { chat: 0, emergency: 0, services: 1, timeframe: 2, postal_code: 3, summary: 4 };

// Antal gennemførte trin; "ready" og "submitted" er alle fem.
function doneCount(step: CaseFlowStep): number {
  return INDEX[step] ?? LABELS.length;
}

export function FlowProgress({ step }: { step: CaseFlowStep }) {
  const done = doneCount(step);
  const current = Math.min(done, LABELS.length - 1);
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Trin ${current + 1} af ${LABELS.length}: ${LABELS[current]}`}
      accessibilityValue={{ min: 0, max: LABELS.length, now: done }}
    >
      <View style={styles.bars}>
        {LABELS.map((label, i) => (
          <View key={label} style={[styles.bar, i < done || i === current ? styles.barOn : null]} />
        ))}
      </View>
      <Text style={type.caption}>
        {current + 1} af {LABELS.length} · {LABELS[current]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  bars: { flexDirection: "row", gap: spacing.xs },
  bar: { flex: 1, height: 3, borderRadius: radius.pill, backgroundColor: colors.line },
  barOn: { backgroundColor: colors.brand600 },
});
