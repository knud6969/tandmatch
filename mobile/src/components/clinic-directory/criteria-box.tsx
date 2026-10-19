import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "~/theme";

// Kriterierne, som rækkefølgen bygger på (serverens `criteria`). Rangeringen er fast og ikke AI-baseret (architecture 6.6).
export function CriteriaBox({ criteria }: { criteria: string[] }) {
  if (criteria.length === 0) return null;
  return (
    <View style={styles.box} accessible accessibilityLabel={`Sådan er listen sorteret. ${criteria.join(". ")}`}>
      <Text style={styles.title}>Sådan er listen sorteret</Text>
      {criteria.map((line) => (
        <Text key={line} style={styles.line}>
          • {line}
        </Text>
      ))}
      <Text style={styles.line}>Rækkefølgen bestemmes af faste kriterier, ikke af AI.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.infoBg, borderColor: colors.infoLine, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  title: { fontSize: fontSize.sm, fontWeight: "700", color: colors.brand800 },
  line: { fontSize: fontSize.sm, color: colors.ink },
});
