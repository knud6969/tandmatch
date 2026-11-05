import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CALENDAR_REMINDER_TEXT } from "@/lib/booking/domain/calendar-event";
import { RESCHEDULE_BOOKING_CONSEQUENCE } from "@/lib/booking/constants/bookings";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import { BOOKING_NOT_RESCHEDULABLE_TEXT } from "@/lib/common/constants/error-texts";
import { formatDateTime } from "@/lib/common/domain/format";
import { getBookingAvailability, listBookings, rescheduleBooking } from "~/api/bookings";
import { AddToCalendarButton } from "~/components/booking/add-to-calendar-button";
import { BookingCard } from "~/components/booking/booking-card";
import { SlotPicker } from "~/components/booking/slot-picker";
import { BackLink, Button, confirmAction, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { AccountRequired } from "~/screens/account-required";
import { colors, spacing, type } from "~/theme";
import { groupSlotsByDay, rescheduleFailure } from "~/utils/booking-form";
import { findCaseIdForLead } from "~/utils/lead-case";

// Den nuværende booking, hvis den kan flyttes; ellers fejlen, der forklarer hvorfor.
async function loadBooking(bookingId: string): Promise<PatientBookingDto> {
  const booking = (await listBookings()).find((b) => b.id === bookingId);
  if (!booking) throw new Error("not found");
  return booking;
}

function RescheduleForm({ booking, onMoved }: { booking: PatientBookingDto; onMoved: (b: PatientBookingDto) => void }) {
  const router = useRouter();
  const slots = useLoad(() => getBookingAvailability(booking.id), [booking.id]);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const days = groupSlotsByDay(slots.data ?? []);

  async function submit(chosen: string) {
    setFailure(null);
    setPending(true);
    try {
      onMoved(await rescheduleBooking(booking.id, chosen));
    } catch (e) {
      const f = rescheduleFailure(e);
      setFailure(f.message);
      setBlocked(f.notReschedulable);
      if (f.clearSlot) setStartsAt(null);
      if (f.refetchSlots) slots.reload();
    } finally {
      setPending(false);
    }
  }

  const ask = () => {
    if (!startsAt) return;
    confirmAction({
      title: `Flyt tiden til ${formatDateTime(startsAt)}?`,
      message: RESCHEDULE_BOOKING_CONSEQUENCE,
      confirmLabel: "Flyt tid",
      destructive: false,
      onConfirm: () => void submit(startsAt),
    });
  };

  async function writeToClinic() {
    const caseId = await findCaseIdForLead(booking.leadId).catch(() => null);
    if (caseId) router.push({ pathname: "/sag/[caseId]/beskeder/[leadId]", params: { caseId, leadId: booking.leadId } });
    else router.replace("/sager");
  }

  return (
    <Screen
      footer={
        blocked ? null : (
          <>
            <Text style={styles.muted} accessibilityLiveRegion="polite">
              {startsAt ? `Ny tid: ${formatDateTime(startsAt)}` : "Vælg en ny tid."}
            </Text>
            <Button label="Flyt tid" disabled={!startsAt} loading={pending} onPress={ask} />
          </>
        )
      }
    >
      <BackLink label="Mine bookinger" onPress={() => (router.canGoBack() ? router.back() : router.replace("/bookinger"))} />
      <Text accessibilityRole="header" style={styles.title}>
        Flyt tid hos {booking.clinic.name}
      </Text>
      <Text style={styles.now}>Din tid nu: {formatDateTime(booking.startsAt)}</Text>
      <Text style={styles.body}>Behandling: {booking.service.name}</Text>
      {blocked ? (
        <>
          <StatusMessage message={failure ?? BOOKING_NOT_RESCHEDULABLE_TEXT} tone="danger" />
          <Button label="Skriv til klinikken" onPress={() => void writeToClinic()} />
        </>
      ) : (
        <>
          <LoadState {...slots} onRetry={slots.reload}>
            {() =>
              days.length === 0 ? (
                <StatusMessage message="Ingen ledige tider de næste 14 dage. Skriv til klinikken." tone="warning" />
              ) : (
                <SlotPicker days={days} selectedStartsAt={startsAt} onSelect={setStartsAt} />
              )
            }
          </LoadState>
          {failure ? <StatusMessage message={failure} tone="danger" /> : null}
        </>
      )}
    </Screen>
  );
}

function RescheduleContent() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const booking = useLoad(() => loadBooking(bookingId), [bookingId]);
  const [moved, setMoved] = useState<PatientBookingDto | null>(null);

  if (moved) {
    return (
      <Screen>
        <Text accessibilityRole="header" style={styles.title}>
          Din tid er flyttet
        </Text>
        <BookingCard booking={moved} />
        <AddToCalendarButton booking={moved} />
        <Text style={styles.muted}>{CALENDAR_REMINDER_TEXT}</Text>
        <Button label="Se mine bookinger" onPress={() => router.replace("/bookinger")} />
      </Screen>
    );
  }
  return (
    <LoadState {...booking} onRetry={booking.reload}>
      {(loaded) =>
        loaded.canReschedule ? (
          <RescheduleForm booking={loaded} onMoved={setMoved} />
        ) : (
          <Screen>
            <BackLink label="Mine bookinger" onPress={() => router.replace("/bookinger")} />
            <StatusMessage message={BOOKING_NOT_RESCHEDULABLE_TEXT} tone="warning" />
          </Screen>
        )
      }
    </LoadState>
  );
}

// Flyt en booket tid (mobile 13.12, booking 10.16). Samme tidsvælger som "Book tid".
export function RescheduleScreen() {
  return (
    <AccountRequired title="Log ind for at flytte en tid">
      <RescheduleContent />
    </AccountRequired>
  );
}

const styles = StyleSheet.create({
  title: type.screenTitle,
  now: { ...type.body, color: colors.ink, fontWeight: "600" },
  body: { ...type.body, color: colors.ink },
  muted: { ...type.caption, marginBottom: spacing.xs },
});
