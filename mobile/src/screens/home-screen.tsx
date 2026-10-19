import { StyleSheet, Text } from "react-native";
import { CONSENT_TYPE_LABEL } from "@/lib/constants/consents";
import { Badge, Card, Screen } from "~/components/ui";
import { colors, fontSize } from "~/theme";

// Skelet: de tre indgange (Beskriv dit problem, Find en klinik, Jeg har ondt) kommer i senere opgaver.
// Importen af @/lib/constants/consents er bevis for, at lib/ deles med serveren.
export function HomeScreen() {
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Find den rigtige tandklinik
      </Text>
      <Text style={styles.body}>Beskriv dit problem, sammenlign klinikker og book en tid.</Text>
      <Card>
        <Badge label="Delt med serveren" />
        <Text style={styles.body}>Samtykke i appen: {CONSENT_TYPE_LABEL.ai_processing}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.ink },
});
