import { useRef } from "react";
import { StyleSheet, Text, View, type HostInstance } from "react-native";
import { fontSize, radius, spacing } from "~/theme";
import { useScrollIntoView } from "./screen";
import { StatusIcon, TONES, type Tone } from "./status-icon";

// Besked i en tone. Fejl får rollen "alert" og læses op med det samme (accessibilityLiveRegion), og rulles ind i billedet,
// når de dukker op. Samme udseende som Alert på weben: ikon, tonens farver og afrundet kasse.
export function StatusMessage({ message, tone = "info" }: { message: string; tone?: Tone }) {
  const t = TONES[tone];
  const ref = useRef<HostInstance>(null);
  useScrollIntoView(ref, tone === "danger", message);
  return (
    <View
      ref={ref}
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "danger" ? "assertive" : "polite"}
      style={[styles.box, { backgroundColor: t.bg, borderColor: t.line }]}
    >
      {tone !== "info" ? <StatusIcon tone={tone} /> : null}
      <Text style={[styles.text, { color: t.ink }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  text: { flex: 1, fontSize: fontSize.md, lineHeight: 22 },
});
