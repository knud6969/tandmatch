import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { Badge } from "~/components/ui";
import { colors, radius, spacing, type } from "~/theme";
import { VERIFIED_CLINIC_LABEL } from "@/lib/clinics/constants/clinic-texts";
import { formatKm, formatShortDateTime } from "@/lib/common/domain/format";

type Props = { clinic: ClinicListItemDto; selected: boolean; onPress: () => void };

// En klinik med ledig akuttid. Hele kortet er trykflade; den valgte har blå kant. Første akuttid vises som tidspunkt, ikke som løfte.
export function EmergencyClinicOption({ clinic, selected, onPress }: Props) {
  const where = `${clinic.address}, ${clinic.postalCode} ${clinic.city}${clinic.distanceKm !== null ? `, ${formatKm(clinic.distanceKm)} væk` : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${clinic.name}. ${where}. Første akuttid ${clinic.firstEmergencyAt ? formatShortDateTime(clinic.firstEmergencyAt) : "ukendt"}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      <Badge label={VERIFIED_CLINIC_LABEL} tone="info" />
      <Text style={type.heading}>{clinic.name}</Text>
      <Text style={type.caption}>{where}</Text>
      {clinic.firstEmergencyAt ? (
        <View>
          <Text style={styles.time}>Første akuttid: {formatShortDateTime(clinic.firstEmergencyAt)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg },
  selected: { borderColor: colors.brand600, borderWidth: 2 },
  pressed: { opacity: 0.85 },
  time: { ...type.label, color: colors.brand700 },
});
