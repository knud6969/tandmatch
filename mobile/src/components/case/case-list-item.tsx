import { Pressable, StyleSheet, Text, View } from "react-native";
import { LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import type { CaseListItemDto } from "@/lib/cases/types/cases";
import { Badge } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";
import { caseStatusLine, caseTitle, leadTone } from "~/utils/case-view";
import { formatDateTime } from "~/utils/format";

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
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  lead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  leadName: { flex: 1, fontSize: fontSize.md, color: colors.ink },
  booking: { fontSize: fontSize.sm, fontWeight: "600", color: colors.brand700 },
});
