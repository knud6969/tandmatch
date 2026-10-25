import { Pressable, StyleSheet, Text, View } from "react-native";
import { LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import type { CaseListItemDto } from "@/lib/cases/types/cases";
import { Badge } from "~/components/ui";
import { colors, radius, spacing, type } from "~/theme";
import { caseStatusLine, caseTitle, leadTone } from "~/utils/case-view";
import { formatDateTime } from "@/lib/common/domain/format";

// En sag i listen: behandlinger, status pr. klinik og sagens næste booking.
export function CaseListItem({ item, onPress }: { item: CaseListItemDto; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${caseTitle(item)}. ${caseStatusLine(item)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.title}>{caseTitle(item)}</Text>
      <Text style={styles.muted}>{caseStatusLine(item)}</Text>
      {item.leads.map((lead) => (
        <View key={lead.id} style={styles.lead}>
          <Text style={styles.leadName}>{lead.removed ? "Klinik ikke længere på TandMatch" : lead.clinicName}</Text>
          <Badge label={LEAD_STATUS_LABEL[lead.status]} tone={leadTone(lead.status)} />
        </View>
      ))}
      {item.nextBooking ? (
        <Text style={styles.booking}>
          Næste tid: {formatDateTime(item.nextBooking.startsAt)} hos {item.nextBooking.clinicName}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface },
  pressed: { opacity: 0.9 },
  title: type.heading,
  muted: type.caption,
  lead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  leadName: { ...type.body, flex: 1, color: colors.ink },
  booking: { ...type.caption, fontWeight: "600", color: colors.brand700 },
});
