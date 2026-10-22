import { StyleSheet, Text } from "react-native";
import { BOOKING_STATUS_LABEL } from "@/lib/booking/constants/bookings";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import { Badge, Card } from "~/components/ui";
import { colors, fontSize } from "~/theme";
import { formatDateTime } from "~/utils/format";

// En booking: tidspunkt, klinik, behandling og status.
export function BookingCard({ booking }: { booking: PatientBookingDto }) {
  const tone = booking.status === "booked" || booking.status === "held" ? "success" : booking.status === "completed" ? "info" : "warning";
  return (
    <Card>
      <Badge label={BOOKING_STATUS_LABEL[booking.status]} tone={tone} />
      <Text style={styles.time}>{formatDateTime(booking.startsAt)}</Text>
      <Text style={styles.body}>{booking.service.name}</Text>
      <Text style={styles.muted}>
        {booking.clinic.name}, {booking.clinic.address}, {booking.clinic.city}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  time: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.ink },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
});
