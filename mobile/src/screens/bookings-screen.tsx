import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import { cancelBooking, listBookings } from "~/api/bookings";
import { BookingCard } from "~/components/booking/booking-card";
import { BackLink, confirmAction, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { useReloadOnFocus } from "~/hooks/use-reload-on-focus";
import { type } from "~/theme";
import { splitBookings } from "~/utils/booking-form";
import { CANCEL_BOOKING_CONSEQUENCE } from "~/utils/case-actions";

// Patientens bookinger, kommende og tidligere (architecture 13.4).
export function BookingsScreen() {
  const router = useRouter();
  const bookings = useLoad(listBookings);
  useReloadOnFocus(bookings.reload);

  // Aflysning efter bekræftelse; listen hentes igen bagefter, også ved BOOKING_NOT_CANCELLABLE, så den nyeste status ses.
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancel = useAction(async (bookingId: string) => {
    setCancellingId(bookingId);
    try {
      await cancelBooking(bookingId);
    } finally {
      setCancellingId(null);
      bookings.reload();
    }
  });
  const askCancel = (booking: PatientBookingDto) =>
    confirmAction({
      title: `Aflys tiden hos ${booking.clinic.name}?`,
      message: CANCEL_BOOKING_CONSEQUENCE,
      confirmLabel: "Aflys tiden",
      onConfirm: () => void cancel.run(booking.id),
    });
  const card = (b: PatientBookingDto) => (
    <BookingCard
      key={b.id}
      booking={b}
      onCancel={() => askCancel(b)}
      cancelling={cancellingId === b.id}
      onReview={() => router.push({ pathname: "/anmeld/[bookingId]", params: { bookingId: b.id } })}
    />
  );
  return (
    <Screen>
      <BackLink label="Mine sager" onPress={() => (router.canGoBack() ? router.back() : router.replace("/sager"))} />
      <Text accessibilityRole="header" style={styles.title}>
        Mine bookinger
      </Text>
      {cancel.error ? <StatusMessage message={cancel.error} tone="danger" /> : null}
      <LoadState {...bookings} onRetry={bookings.reload}>
        {(list) => {
          const { upcoming, past } = splitBookings(list);
          if (list.length === 0) return <Text style={styles.muted}>Du har ingen bookinger endnu. Når en klinik har accepteret din henvendelse, kan du booke en tid fra sagen.</Text>;
          return (
            <>
              <Text style={styles.heading}>Kommende</Text>
              {upcoming.length === 0 ? <Text style={styles.muted}>Ingen kommende tider.</Text> : upcoming.map(card)}
              {past.length > 0 ? (
                <>
                  <Text style={styles.heading}>Tidligere</Text>
                  {past.map(card)}
                </>
              ) : null}
            </>
          );
        }}
      </LoadState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: type.screenTitle,
  heading: type.heading,
  muted: type.body,
});
