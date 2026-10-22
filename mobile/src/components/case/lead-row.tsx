import { StyleSheet, Text, View } from "react-native";
import { LEAD_DECLINE_REASON_LABEL, LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import type { PatientLeadDto } from "@/lib/leads/types/leads";
import { Badge, Button, Card } from "~/components/ui";
import { colors, fontSize, spacing } from "~/theme";
import { bookingStatusText, canBookLead, declineText, leadTone } from "~/utils/case-view";
import { PRICE_FINAL_NOTE, PRICE_SOURCE } from "~/utils/clinic-texts";
import { formatDateTime, formatPriceRange } from "~/utils/format";

// Et lead på sagsskærmen: klinik, status og det klinikken har svaret (13.4). Priser vises altid med kilde.
export function LeadRow({ lead, onBook }: { lead: PatientLeadDto; onBook: () => void }) {
  const decline = declineText(lead);
  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.name}>{lead.clinic.name}</Text>
          {!lead.clinic.removed ? <Text style={styles.muted}>{lead.clinic.city}</Text> : null}
        </View>
        <Badge label={LEAD_STATUS_LABEL[lead.status]} tone={leadTone(lead.status)} />
      </View>

      {lead.clinic.removed ? <Text style={styles.muted}>{LEAD_DECLINE_REASON_LABEL.clinic_left}</Text> : null}
      {lead.status === "sent" ? <Text style={styles.muted}>Klinikken har endnu ikke svaret. Klinikken laver den endelige vurdering.</Text> : null}

      {lead.status === "accepted" || lead.status === "booked" ? (
        <>
          {lead.clinicComment ? (
            <View style={styles.fact}>
              <Text style={styles.label}>Klinikkens kommentar</Text>
              <Text style={styles.body}>{lead.clinicComment}</Text>
            </View>
          ) : null}
          {lead.quotedPrice ? (
            <View style={styles.fact}>
              <Text style={styles.label}>Præciseret pris</Text>
              <Text style={styles.body}>
                <Text style={styles.strong}>{formatPriceRange(lead.quotedPrice.min, lead.quotedPrice.max)}</Text>, oplyst af klinikken efter at have set din sag
              </Text>
            </View>
          ) : null}
          {lead.listPrice ? (
            <Text style={styles.muted}>
              Listepris: {formatPriceRange(lead.listPrice.min, lead.listPrice.max)}, {PRICE_SOURCE}
            </Text>
          ) : null}
          <Text style={styles.muted}>{PRICE_FINAL_NOTE}</Text>
        </>
      ) : null}

      {lead.status === "declined" && decline ? <Text style={styles.body}>{decline}</Text> : null}

      {lead.booking ? (
        <View style={styles.fact}>
          <Text style={styles.label}>
            Booking: {bookingStatusText(lead.booking.status).toLowerCase()} · {lead.booking.service.name}
          </Text>
          <Text style={styles.body}>{formatDateTime(lead.booking.startsAt)}</Text>
        </View>
      ) : null}

      {canBookLead(lead) ? <Button label="Book tid" accessibilityLabel={`Book tid hos ${lead.clinic.name}`} onPress={onBook} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headText: { flex: 1 },
  name: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  body: { fontSize: fontSize.md, color: colors.ink },
  strong: { fontWeight: "700" },
  label: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink },
  fact: { gap: 2 },
});
