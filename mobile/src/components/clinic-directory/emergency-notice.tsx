import { Linking, StyleSheet, Text, View } from "react-native";
import { LIFE_THREATENING_REFERRAL_TEXT } from "@/lib/cases/constants/ai-texts";
import { EMERGENCY_CALL_NUMBER, OUT_OF_HOURS_NUMBER } from "@/lib/constants/emergency";
import { Button } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";

// Fast akut-tekst: livstruende symptomer (112) og lægevagten. Teksterne og numrene kommer fra lib/constants.
// Rollen "alert" får skærmlæsere til at læse henvisningen op med det samme.
export function EmergencyNotice() {
  return (
    <View accessibilityRole="alert" style={styles.box}>
      <Text style={styles.title}>Det kan være akut</Text>
      <Text style={styles.text}>{LIFE_THREATENING_REFERRAL_TEXT}</Text>
      <Button label={`Ring ${EMERGENCY_CALL_NUMBER}`} onPress={() => void Linking.openURL(`tel:${EMERGENCY_CALL_NUMBER}`)} />
      <Button
        label={`Ring ${OUT_OF_HOURS_NUMBER} (Region Hovedstaden)`}
        variant="secondary"
        onPress={() => void Linking.openURL(`tel:${OUT_OF_HOURS_NUMBER}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.dangerBg, borderColor: colors.dangerLine, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: "700", color: colors.dangerInk },
  text: { fontSize: fontSize.sm, color: colors.dangerInk, lineHeight: 20 },
});
