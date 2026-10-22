import { StyleSheet, Text } from "react-native";
import { CASE_FLOW_TEXTS } from "@/lib/cases/constants/case-flow";
import { Button } from "~/components/ui";
import { colors, fontSize } from "~/theme";
import { FlowCard } from "./flow-card";

type Props = { canSend: boolean; onSeeClinics: () => void; onOpenCases: () => void };

// Sidste kort: sagen er klar. Patienten vælger selv klinikker i oversigten (8.8a), og kontoen oprettes først ved afsendelse.
// canSend er falsk, når sagen ikke kan sendes (fx alle pladser er brugt); så henvises til Mine sager.
export function ReadyCard({ canSend, onSeeClinics, onOpenCases }: Props) {
  return (
    <FlowCard title={CASE_FLOW_TEXTS.readyTitle} testID="kort-klar">
      {canSend ? (
        <Button label={CASE_FLOW_TEXTS.readySeeClinics} onPress={onSeeClinics} />
      ) : (
        <>
          <Text style={styles.text}>{CASE_FLOW_TEXTS.readyCannotSend}</Text>
          <Button label="Gå til Mine sager" variant="secondary" onPress={onOpenCases} />
        </>
      )}
    </FlowCard>
  );
}

const styles = StyleSheet.create({ text: { fontSize: fontSize.md, lineHeight: 22, color: colors.inkMuted } });
