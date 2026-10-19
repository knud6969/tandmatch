import { StyleSheet, Text } from "react-native";
import { Screen } from "~/components/ui";
import { colors, fontSize } from "~/theme";

export function ClinicsScreen() {
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Klinikker
      </Text>
      <Text style={styles.body}>Her kommer oversigten over klinikker.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.inkMuted },
});
