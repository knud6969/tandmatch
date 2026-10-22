import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "~/theme";

// Siger tydeligt, hvilke behandlinger listen er filtreret på (13.4a), og om andre klinikker er med.
export function OfferingNotice({ names, onlyOffering }: { names: string[]; onlyOffering: boolean }) {
  if (names.length === 0) return null;
  return (
    <View style={styles.box} accessible accessibilityLabel={`${onlyOffering ? "Filtreret på" : "Prisen vises for"} ${names.join(", ")}`}>
      <Text style={styles.eyebrow}>{onlyOffering ? "Klinikker med pris på" : "Pris vises for"}</Text>
      <Text style={styles.names}>{names.join(", ")}</Text>
      {!onlyOffering ? <Text style={styles.hint}>Klinikker uden pris på alle behandlingerne er med, men kan ikke vælges.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  eyebrow: { fontSize: 12, fontWeight: "600", letterSpacing: 0.6, color: colors.inkMuted },
  names: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  hint: { fontSize: fontSize.sm, color: colors.inkMuted },
});
