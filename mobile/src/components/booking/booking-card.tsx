import { StyleSheet, Text } from "react-native";
import { BOOKING_STATUS_LABEL } from "@/lib/booking/constants/bookings";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import { Badge, Button, Card } from "~/components/ui";
import { canCancelBooking, canReviewBooking } from "~/utils/case-actions";
import { colors, type } from "~/theme";
import { bookingTone } from "~/utils/case-view";
import { formatDateTime } from "~/utils/format";

type Props = { booking: PatientBookingDto; onCancel?: () => void; cancelling?: boolean; onReview?: () => void };

// En booking: tidspunkt, klinik, behandling og status. "Aflys" og "Skriv anmeldelse" vises kun, når serveren tillader det og skærmen giver handlingen.
export function BookingCard({ booking, onCancel, cancelling = false, onReview }: Props) {
  return (
    <Card>
      <Badge label={BOOKING_STATUS_LABEL[booking.status]} tone={bookingTone(booking.status)} />
      <Text style={styles.time}>{formatDateTime(booking.startsAt)}</Text>
      <Text style={styles.body}>{booking.service.name}</Text>
      <Text style={styles.muted}>
        {booking.clinic.name}, {booking.clinic.address}, {booking.clinic.city}
      </Text>
      {onReview && canReviewBooking(booking) ? (
        <Button label="Skriv anmeldelse" accessibilityLabel={`Skriv anmeldelse af ${booking.clinic.name}`} onPress={onReview} />
      ) : null}
      {onCancel && canCancelBooking(booking) ? (
        <Button label="Aflys tiden" accessibilityLabel={`Aflys tiden hos ${booking.clinic.name}`} variant="secondary" loading={cancelling} onPress={onCancel} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  time: type.heading,
  body: { ...type.body, color: colors.ink },
  muted: type.caption,
});
