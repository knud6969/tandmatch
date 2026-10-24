import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CASE_FLOW_TEXTS } from "@/lib/cases/constants/case-flow";
import { Button } from "~/components/ui";
import { colors, iconSize, radius, spacing, type } from "~/theme";

type Props = { canSend: boolean; onSeeClinics: () => void; onOpenCases: () => void };

// Sidste kort: sagen er klar. Patienten vælger selv klinikker i oversigten (8.8a), og kontoen oprettes først ved afsendelse.
// canSend er falsk, når sagen ikke kan sendes (fx alle pladser er brugt); så henvises til Mine sager.
// Kortet er tydeligt anderledes end spørgsmålskortene: lys baggrund, hak og én stor knap.
export function ReadyCard({ canSend, onSeeClinics, onOpenCases }: Props) {
  return (
    <View style={styles.card} testID="kort-klar" accessibilityLabel={`Fra TandMatch: ${CASE_FLOW_TEXTS.readyTitle}`}>
      <View style={styles.titleRow}>
        <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.successInk} />
        <Text accessibilityRole="header" style={type.title}>
          {CASE_FLOW_TEXTS.readyTitle}
        </Text>
      </View>
      {canSend ? (
        <Button label={CASE_FLOW_TEXTS.readySeeClinics} onPress={onSeeClinics} />
      ) : (
        <>
          <Text style={type.body}>{CASE_FLOW_TEXTS.readyCannotSend}</Text>
          <Button label="Gå til Mine sager" variant="secondary" onPress={onOpenCases} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, backgroundColor: colors.successBg, borderColor: colors.successLine, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
