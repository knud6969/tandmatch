import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, type } from "~/theme";

// Siger tydeligt, hvilke behandlinger listen er filtreret på (13.4a), og om andre klinikker er med.
export function OfferingNotice({ names, onlyOffering, caseMode = false }: { names: string[]; onlyOffering: boolean; caseMode?: boolean }) {
  if (names.length === 0) return null;
  return (
    <View style={styles.box} accessible accessibilityLabel={`${onlyOffering ? "Filtreret på" : "Prisen vises for"} ${names.join(", ")}`}>
      <Text style={styles.eyebrow}>{onlyOffering ? "Klinikker med pris på" : "Pris vises for"}</Text>
      <Text style={styles.names}>{names.join(", ")}</Text>
      {!onlyOffering && caseMode ? <Text style={styles.hint}>Klinikker uden pris på alle behandlingerne er med, men kan ikke vælges.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  eyebrow: type.eyebrow,
  names: type.label,
  hint: type.caption,
});
