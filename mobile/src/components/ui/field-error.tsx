import { useRef } from "react";
import { StyleSheet, Text, View, type HostInstance } from "react-native";
import { colors, spacing, type } from "~/theme";
import { useScrollIntoView } from "./screen";
import { StatusIcon } from "./status-icon";

// Fejl under ét felt (tekstfelt, valg, stjerner). Placeres lige under feltet, i samme farve og med samme ikon som
// alle andre fejl (samme som FieldError på weben). Læses op, når den dukker op, og rulles ind i billedet.
export function FieldError({ message }: { message: string }) {
  const ref = useRef<HostInstance>(null);
  useScrollIntoView(ref, true, message);
  return (
    <View ref={ref} accessibilityLiveRegion="polite" style={styles.row}>
      <StatusIcon tone="danger" size={16} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  text: { ...type.caption, flex: 1, fontWeight: "600", color: colors.dangerInk },
});
