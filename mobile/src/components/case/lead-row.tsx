import { StyleSheet, Text, View } from "react-native";
import { BOOKING_STATUS_LABEL } from "@/lib/booking/constants/bookings";
import { LEAD_DECLINE_REASON_LABEL, LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import type { PatientLeadDto } from "@/lib/leads/types/leads";
import { Badge, Button, Card } from "~/components/ui";
import { colors, radius, spacing, type } from "~/theme";
import { canMessageLead, canWithdrawLead, messagesLabel } from "~/utils/case-actions";
import { canBookLead, declineText, leadTone, proposedBooking } from "~/utils/case-view";
import { PRICE_FINAL_NOTE, PRICE_SOURCE } from "@/lib/clinics/constants/clinic-texts";
import { formatDateTime, formatPriceRange, formatTime } from "@/lib/common/domain/format";

// Et lead på sagsskærmen: klinik, status og det klinikken har svaret (13.4). Priser vises altid med kilde.
type Props = {
  lead: PatientLeadDto;
  onBook: () => void;
  onMessages: () => void;
  onWithdraw: () => void;
  withdrawing?: boolean;
  // Bekræft klinikkens foreslåede akuttid (leads 10.11).
  onConfirm: (bookingId: string) => void;
  confirming?: boolean;
};

// Under leadet: bekræft en foreslået akuttid, book, skriv til klinikken (med antal nye) og træk tilbage, mens klinikken ikke har svaret.
export function LeadRow({ lead, onBook, onMessages, onWithdraw, withdrawing = false, onConfirm, confirming = false }: Props) {
  const decline = declineText(lead);
  const proposal = proposedBooking(lead);
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

      {proposal ? (
        <View style={styles.proposal}>
          <Text style={styles.label}>Klinikken foreslår en tid</Text>
          <Text style={styles.time}>{formatDateTime(proposal.startsAt)}</Text>
          <Text style={styles.muted}>
            {proposal.service.name}. Tiden er holdt til dig til kl. {formatTime(proposal.holdExpiresAt ?? proposal.startsAt)}. Klinikken ser dit navn og nummer, når du har bekræftet.
          </Text>
          <Button label="Bekræft tiden" accessibilityLabel={`Bekræft tiden hos ${lead.clinic.name}`} loading={confirming} onPress={() => onConfirm(proposal.id)} />
        </View>
      ) : lead.booking && lead.booking.status !== "held" ? (
        <View style={styles.fact}>
          <Text style={styles.label}>
            Booking: {BOOKING_STATUS_LABEL[lead.booking.status].toLowerCase()} · {lead.booking.service.name}
          </Text>
          <Text style={styles.body}>{formatDateTime(lead.booking.startsAt)}</Text>
        </View>
      ) : null}

      {canBookLead(lead) ? (
        <Button
          label={proposal ? "Vælg en anden tid" : "Book tid"}
          accessibilityLabel={`${proposal ? "Vælg en anden tid" : "Book tid"} hos ${lead.clinic.name}`}
          variant={proposal ? "secondary" : "primary"}
          onPress={onBook}
        />
      ) : null}
      {canMessageLead(lead) ? (
        <Button
          label={messagesLabel(lead.unreadMessages)}
          accessibilityLabel={`${messagesLabel(lead.unreadMessages)}: ${lead.clinic.name}`}
          variant="secondary"
          onPress={onMessages}
        />
      ) : null}
      {canWithdrawLead(lead) ? (
        <Button label="Træk henvendelsen tilbage" accessibilityLabel={`Træk henvendelsen til ${lead.clinic.name} tilbage`} variant="text" loading={withdrawing} onPress={onWithdraw} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headText: { flex: 1 },
  name: type.heading,
  muted: type.caption,
  body: { ...type.body, color: colors.ink },
  strong: { fontWeight: "700" },
  label: { ...type.caption, fontWeight: "700", color: colors.ink },
  fact: { gap: spacing.xs },
  proposal: { gap: spacing.xs, borderWidth: 1, borderColor: colors.brand600, borderRadius: radius.md, padding: spacing.md },
  time: type.heading,
});
