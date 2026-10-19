import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CASE_FLOW_TEXTS } from "@/lib/constants/case-flow";
import { CASE_TIMEFRAME_LABEL, CASE_TIMEFRAMES } from "@/lib/constants/cases";
import type { CaseDto, CaseTimeframe } from "@/lib/types/cases";
import { Chip, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import type { CaseActions } from "~/hooks/use-case-actions";
import { spacing } from "~/theme";
import { FlowCard, FoldedCard } from "./flow-card";

type Props = { caseDto: CaseDto; answered: boolean; actions: CaseActions; onSaved: () => void };

// "Hvornår vil du gerne i gang?": et tryk på et tidsrum gemmer det (architecture 7.9).
export function TimeframeCard({ caseDto, answered, actions, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const save = useAction(async (value: CaseTimeframe) => {
    await actions.setTimeframe(value);
    setEditing(false);
    onSaved();
  });

  if (answered && !editing && caseDto.preferredTimeframe) {
    return (
      <FoldedCard
        testID="kort-tidsrum-besvaret"
        label="Ønsket tidsrum"
        value={CASE_TIMEFRAME_LABEL[caseDto.preferredTimeframe]}
        onEdit={() => setEditing(true)}
      />
    );
  }

  return (
    <FlowCard title={CASE_FLOW_TEXTS.timeframeQuestion} testID="kort-tidsrum">
      <View style={styles.chips} accessibilityRole="radiogroup">
        {CASE_TIMEFRAMES.map((value) => (
          <Chip
            key={value}
            label={CASE_TIMEFRAME_LABEL[value]}
            selected={caseDto.preferredTimeframe === value}
            disabled={save.pending}
            onPress={() => void save.run(value)}
          />
        ))}
      </View>
      {save.error ? <StatusMessage message={save.error} tone="danger" /> : null}
    </FlowCard>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm } });
