import { StyleSheet, Text } from "react-native";
import { BOOKING_STATUS_LABEL } from "@/lib/booking/constants/bookings";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import { Badge, Card } from "~/components/ui";
import { colors, type } from "~/theme";
import { bookingTone } from "~/utils/case-view";
import { formatDateTime } from "~/utils/format";

// En booking: tidspunkt, klinik, behandling og status.
export function BookingCard({ booking }: { booking: PatientBookingDto }) {
  return (
    <Card>
      <Badge label={BOOKING_STATUS_LABEL[booking.status]} tone={bookingTone(booking.status)} />
      <Text style={styles.time}>{formatDateTime(booking.startsAt)}</Text>
      <Text style={styles.body}>{booking.service.name}</Text>
      <Text style={styles.muted}>
        {booking.clinic.name}, {booking.clinic.address}, {booking.clinic.city}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  time: type.heading,
  body: { ...type.body, color: colors.ink },
  muted: type.caption,
});
