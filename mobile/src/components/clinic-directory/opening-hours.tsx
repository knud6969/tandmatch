import { StyleSheet, Text, View } from "react-native";
import { WEEKDAYS, WEEKDAY_LABEL } from "@/lib/constants/clinics";
import type { OpeningHoursDto } from "@/lib/types/clinics";
import { colors, fontSize, spacing } from "~/theme";
import { formatClock } from "~/utils/format";

// Åbningstider pr. ugedag. Akutvinduer er tider, hvor klinikken tager imod akutte patienter.
export function OpeningHours({ hours }: { hours: OpeningHoursDto[] }) {
  if (hours.length === 0) return <Text style={styles.muted}>Klinikken har ikke angivet åbningstider.</Text>;
  return (
    <View style={styles.list}>
      {WEEKDAYS.map((weekday) => {
        const windows = hours.filter((h) => h.weekday === weekday).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
        const text =
          windows.length === 0
            ? "Lukket"
            : windows.map((w) => `${formatClock(w.opensAt)}–${formatClock(w.closesAt)}${w.isEmergency ? " (akut)" : ""}`).join(", ");
        return (
          <View key={weekday} style={styles.row} accessible accessibilityLabel={`${WEEKDAY_LABEL[weekday]}: ${text}`}>
            <Text style={styles.day}>{WEEKDAY_LABEL[weekday]}</Text>
            <Text style={windows.length === 0 ? styles.muted : styles.time}>{text}</Text>
          </View>
        );
      })}
      {hours.some((h) => h.isEmergency) ? <Text style={styles.muted}>Tider markeret “akut” er reserveret til akutte patienter.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.xs },
  day: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  time: { fontSize: fontSize.md, color: colors.ink, flexShrink: 1, textAlign: "right" },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
});
