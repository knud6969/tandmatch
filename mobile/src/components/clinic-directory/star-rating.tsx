import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize } from "~/theme";
import { formatOneDecimal } from "~/utils/format";

// Stjerner med tekst til skærmlæsere. `value` kan have decimaler.
export function StarRating({ value, count }: { value: number; count?: number }) {
  // Afrundes til hele stjerner i visningen; det præcise tal står i teksten ved siden af.
  const rounded = Math.round(Math.min(5, Math.max(0, value)));
  const label = `${formatOneDecimal(value)} af 5 stjerner${count !== undefined ? ` ud fra ${count} anmeldelser` : ""}`;
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <Text style={styles.stars} importantForAccessibility="no">
        {"★".repeat(rounded)}
        <Text style={styles.off}>{"★".repeat(5 - rounded)}</Text>
      </Text>
      <Text style={styles.value}>
        {formatOneDecimal(value)}
        {count !== undefined ? <Text style={styles.count}> ({count})</Text> : null}
      </Text>
    </View>
  );
}

// Hele stjerner for en enkelt anmeldelse (1-5).
export function Stars({ stars }: { stars: number }) {
  return (
    <Text accessibilityLabel={`${stars} af 5 stjerner`} style={styles.stars}>
      {"★".repeat(stars)}
      <Text style={styles.off}>{"★".repeat(5 - stars)}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  stars: { fontSize: fontSize.lg, color: colors.brand700, letterSpacing: 1 },
  off: { color: colors.line },
  value: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink },
  count: { fontWeight: "400", color: colors.inkMuted },
});
