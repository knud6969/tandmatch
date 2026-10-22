import { StyleSheet, Text } from "react-native";
import { Screen } from "~/components/ui";
import { colors, fontSize } from "~/theme";

// Pladsholder for patientens sager, indtil oversigten er bygget.
export function CasesScreen() {
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Mine sager
      </Text>
      <Text style={styles.body}>Her kommer dine sager.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.inkMuted },
});
