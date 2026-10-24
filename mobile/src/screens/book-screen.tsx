import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import type { CaseDto } from "@/lib/cases/types/cases";
import type { PatientLeadDto } from "@/lib/leads/types/leads";
import { bookSlot, getLeadAvailability } from "~/api/bookings";
import { getCase } from "~/api/cases";
import { listCaseLeads } from "~/api/leads";
import { getPatientMe } from "~/api/patients";
import { BookingCard } from "~/components/booking/booking-card";
import { SlotPicker } from "~/components/booking/slot-picker";
import { BackLink, Button, Chip, LoadState, Screen, StatusMessage, TextField } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { colors, spacing, type } from "~/theme";
import { bookingFailure, groupSlotsByDay, parseBooking, type BookingField } from "~/utils/booking-form";
import { canBookLead } from "~/utils/case-view";
import type { FieldErrors } from "~/utils/field-errors";

const LEAD_NOT_FOUND_TEXT = "Henvendelsen findes ikke på denne sag.";

type Loaded = { caseDto: CaseDto; lead: PatientLeadDto; name: string; phone: string };

async function loadBookingData(caseId: string, leadId: string): Promise<Loaded> {
  const [caseDto, leads, me] = await Promise.all([getCase(caseId), listCaseLeads(caseId), getPatientMe().catch(() => null)]);
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) throw new Error(LEAD_NOT_FOUND_TEXT);
  return { caseDto, lead, name: me?.firstName ?? "", phone: me?.phone ?? "" };
}

function BookingForm({ data, leadId, onBooked }: { data: Loaded; leadId: string; onBooked: (b: PatientBookingDto) => void }) {
  const services = data.caseDto.services;
  const [serviceId, setServiceId] = useState<string | null>(services.length === 1 ? services[0].id : null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [name, setName] = useState(data.name);
  const [phone, setPhone] = useState(data.phone);
  const [errors, setErrors] = useState<FieldErrors<BookingField>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const slots = useLoad(() => (serviceId ? getLeadAvailability(leadId, serviceId) : Promise.resolve([])), [leadId, serviceId]);
  const days = groupSlotsByDay(slots.data ?? []);

  async function submit() {
    const parsed = parseBooking({ serviceId, startsAt, contactName: name, contactPhone: phone });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      onBooked(await bookSlot(leadId, parsed.data));
    } catch (e) {
      const f = bookingFailure(e);
      setFailure(f.message);
      if (f.clearSlot) setStartsAt(null);
      if (f.refetchSlots) slots.reload();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {services.length > 1 ? (
        <View style={styles.group}>
          <Text style={styles.label}>Behandling</Text>
          <View style={styles.chips}>
            {services.map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id === serviceId} onPress={() => { setServiceId(s.id); setStartsAt(null); }} />
            ))}
          </View>
          {errors.serviceId ? <Text style={styles.error}>{errors.serviceId}</Text> : null}
        </View>
      ) : (
        <Text style={styles.body}>Behandling: {services[0]?.name}</Text>
      )}

      {serviceId ? (
        <LoadState {...slots} onRetry={slots.reload}>
          {() =>
            days.length === 0 ? (
              <StatusMessage message="Ingen ledige tider de næste 14 dage. Skriv til klinikken." tone="warning" />
            ) : (
              <SlotPicker days={days} selectedStartsAt={startsAt} onSelect={setStartsAt} error={errors.startsAt} />
            )
          }
        </LoadState>
      ) : null}

      <TextField label="Dit navn" value={name} onChangeText={setName} error={errors.contactName} autoComplete="name" />
      <TextField label="Telefon" value={phone} onChangeText={setPhone} error={errors.contactPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Text style={styles.muted}>Klinikken ser dit navn og telefonnummer, når tiden er booket.</Text>
      {failure ? <StatusMessage message={failure} tone="danger" /> : null}
      <Button label="Book tid" loading={pending} onPress={() => void submit()} />
    </>
  );
}

// Book tid på et accepteret lead (architecture 13.4, 10.10), og bekræftelse.
export function BookScreen() {
  const router = useRouter();
  const { caseId, leadId } = useLocalSearchParams<{ caseId: string; leadId: string }>();
  const data = useLoad(() => loadBookingData(caseId, leadId), [caseId, leadId]);
  const [booked, setBooked] = useState<PatientBookingDto | null>(null);
  const back = () => router.replace({ pathname: "/sag/[caseId]", params: { caseId } });

  return (
    <Screen>
      <BackLink label="Sagen" onPress={() => (router.canGoBack() ? router.back() : back())} />
      {booked ? (
        <>
          <Text accessibilityRole="header" style={styles.title}>
            Din tid er booket
          </Text>
          <BookingCard booking={booked} />
          <Text style={styles.muted}>Klinikken kan nu se dit navn og telefonnummer.</Text>
          <Button label="Se mine bookinger" onPress={() => router.replace("/bookinger")} />
          <Button label="Tilbage til sagen" variant="secondary" onPress={back} />
        </>
      ) : (
        <LoadState {...data} onRetry={data.reload}>
          {(loaded) =>
            canBookLead(loaded.lead) ? (
              <>
                <Text accessibilityRole="header" style={styles.title}>
                  Book tid hos {loaded.lead.clinic.name}
                </Text>
                <BookingForm data={loaded} leadId={leadId} onBooked={setBooked} />
              </>
            ) : (
              <StatusMessage message="Du kan booke, når klinikken har accepteret." tone="warning" />
            )
          }
        </LoadState>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: type.screenTitle,
  group: { gap: spacing.sm },
  label: { ...type.caption, fontWeight: "600", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  body: { ...type.body, color: colors.ink },
  muted: type.caption,
  error: { ...type.caption, color: colors.dangerInk },
});
