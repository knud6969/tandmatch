import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { listBookings } from "~/api/bookings";
import { BookingCard } from "~/components/booking/booking-card";
import { BackLink, LoadState, Screen } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { useReloadOnFocus } from "~/hooks/use-reload-on-focus";
import { type } from "~/theme";
import { splitBookings } from "~/utils/booking-form";

// Patientens bookinger, kommende og tidligere (architecture 13.4).
export function BookingsScreen() {
  const router = useRouter();
  const bookings = useLoad(listBookings);
  useReloadOnFocus(bookings.reload);
  return (
    <Screen>
      <BackLink label="Mine sager" onPress={() => (router.canGoBack() ? router.back() : router.replace("/sager"))} />
      <Text accessibilityRole="header" style={styles.title}>
        Mine bookinger
      </Text>
      <LoadState {...bookings} onRetry={bookings.reload}>
        {(list) => {
          const { upcoming, past } = splitBookings(list);
          if (list.length === 0) return <Text style={styles.muted}>Du har ingen bookinger endnu. Når en klinik har accepteret din henvendelse, kan du booke en tid fra sagen.</Text>;
          return (
            <>
              <Text style={styles.heading}>Kommende</Text>
              {upcoming.length === 0 ? <Text style={styles.muted}>Ingen kommende tider.</Text> : upcoming.map((b) => <BookingCard key={b.id} booking={b} />)}
              {past.length > 0 ? (
                <>
                  <Text style={styles.heading}>Tidligere</Text>
                  {past.map((b) => (
                    <BookingCard key={b.id} booking={b} />
                  ))}
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
