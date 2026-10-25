import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Chip } from "~/components/ui";
import { colors, fontSize, spacing } from "~/theme";
import type { SlotDay } from "~/utils/booking-form";
import { formatTime } from "@/lib/common/domain/format";

type Props = { days: SlotDay[]; selectedStartsAt: string | null; onSelect: (startsAt: string) => void; error?: string | null };

// Ledige tider: først dagen, så klokkeslættet. Den valgte dag følger den valgte tid.
export function SlotPicker({ days, selectedStartsAt, onSelect, error }: Props) {
  const selectedDay = days.find((d) => d.slots.some((s) => s.startsAt === selectedStartsAt));
  return (
    <DayAndTimes days={days} selectedStartsAt={selectedStartsAt} initialKey={selectedDay?.key ?? days[0]?.key} onSelect={onSelect} error={error} />
  );
}

function DayAndTimes({ days, selectedStartsAt, initialKey, onSelect, error }: Props & { initialKey?: string }) {
  const [dayKeyState, setDayKey] = useState(initialKey);
  const day = days.find((d) => d.key === dayKeyState) ?? days[0];
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Dag</Text>
      <View style={styles.chips}>
        {days.map((d) => (
          <Chip key={d.key} label={d.label} selected={d.key === day?.key} onPress={() => setDayKey(d.key)} />
        ))}
      </View>
      <Text style={styles.label}>Tidspunkt</Text>
      <View style={styles.chips}>
        {day?.slots.map((slot) => (
          <Chip
            key={slot.startsAt}
            label={formatTime(slot.startsAt)}
            accessibilityLabel={`${day.label} kl. ${formatTime(slot.startsAt)}`}
            selected={slot.startsAt === selectedStartsAt}
            onPress={() => onSelect(slot.startsAt)}
          />
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.dangerInk },
});
