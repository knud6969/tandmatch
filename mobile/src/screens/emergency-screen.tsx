import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { hasCurrentConsent } from "@/lib/identity/domain/consents";
import type { EmergencyLeadCreatedDto } from "@/lib/leads/types/leads";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import type { ServiceDto } from "@/lib/clinics/types/services";
import { CONSENT_TEXTS } from "@/lib/identity/constants/consents";
import { EMERGENCY_CALL_NUMBER, OUT_OF_HOURS_NUMBER } from "@/lib/leads/constants/emergency";
import { getClinicAvailability, sendEmergencyLead } from "~/api/emergency";
import { listClinics } from "~/api/clinics";
import { ApiRequestError } from "~/api/client";
import { getConsents, grantConsent } from "~/api/consents";
import { getPatientMe } from "~/api/patients";
import { getServiceGroups } from "~/api/services";
import { useSession } from "~/auth/session-context";
import { SlotPicker } from "~/components/booking/slot-picker";
import { ConsentGate } from "~/components/case/consent-gate";
import { EmergencyNotice } from "~/components/clinic-directory/emergency-notice";
import { EmergencyClinicOption } from "~/components/emergency/emergency-clinic-option";
import { BackLink, Button, Card, Chip, LoadState, Screen, StatusMessage, TextField } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { colors, spacing, type } from "~/theme";
import { groupSlotsByDay } from "~/utils/booking-form";
import {
  EMERGENCY_DESCRIPTION_LIMITS,
  EMERGENCY_HOLD_TEXT,
  emergencyClinicsQuery,
  emergencyServices,
  parseEmergency,
  selectableEmergencyClinics,
  type EmergencyField,
} from "~/utils/emergency-form";
import type { FieldErrors } from "~/utils/field-errors";
import { formatDateTime } from "~/utils/format";

type Loaded = { services: ServiceDto[]; clinics: ClinicListItemDto[]; name: string; phone: string; consent: boolean };

// Henter akutbehandlinger, klinikker med akuttid (nærmeste postnummer, hvis patienten har et), kontaktoplysninger og samtykke.
async function loadEmergencyData(account: boolean): Promise<Loaded> {
  const [groups, me, consents] = await Promise.all([
    getServiceGroups(),
    account ? getPatientMe().catch(() => null) : Promise.resolve(null),
    account ? getConsents().catch(() => []) : Promise.resolve([]),
  ]);
  const list = await listClinics(emergencyClinicsQuery(me?.postalCode ?? null));
  return {
    services: emergencyServices(groups),
    clinics: selectableEmergencyClinics(list.clinics),
    name: me?.firstName ?? "",
    phone: me?.phone ?? "",
    consent: hasCurrentConsent(consents, "health_data_sharing"),
  };
}

// Formularen for den valgte klinik: behandling, ledig tid, beskrivelse og kontaktoplysninger. Sendes til netop denne klinik.
function EmergencyForm({ clinic, data, onSent }: { clinic: ClinicListItemDto; data: Loaded; onSent: (r: EmergencyLeadCreatedDto) => void }) {
  const [serviceId, setServiceId] = useState<string | null>(data.services.length === 1 ? data.services[0].id : null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [name, setName] = useState(data.name);
  const [phone, setPhone] = useState(data.phone);
  const [consent, setConsent] = useState(data.consent);
  const [errors, setErrors] = useState<FieldErrors<EmergencyField>>({});

  const slots = useLoad(() => (serviceId ? getClinicAvailability(clinic.id, serviceId) : Promise.resolve([])), [clinic.id, serviceId]);
  const days = groupSlotsByDay(slots.data ?? []);

  const grant = useAction(async () => {
    await grantConsent("health_data_sharing");
    setConsent(true);
  });
  const submit = useAction(async () => {
    const parsed = parseEmergency({ clinicId: clinic.id, serviceId, startsAt, description, contactName: name, contactPhone: phone });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    try {
      onSent(await sendEmergencyLead(parsed.data));
    } catch (e) {
      // Tiden blev optaget, eller samtykket mangler: hent tiderne igen / vis samtykket igen, og vis serverens danske tekst.
      if (e instanceof ApiRequestError && e.code === "SLOT_TAKEN") {
        setStartsAt(null);
        slots.reload();
      } else if (e instanceof ApiRequestError && e.code === "SLOT_UNAVAILABLE") {
        setStartsAt(null);
      } else if (e instanceof ApiRequestError && e.code === "CONSENT_REQUIRED") {
        setConsent(false);
      }
      throw e;
    }
  });

  return (
    <Card>
      <Text style={type.heading}>Send akut henvendelse til {clinic.name}</Text>

      {data.services.length === 0 ? (
        <StatusMessage message={`Der er ingen akutbehandlinger i kataloget lige nu. Ring ${OUT_OF_HOURS_NUMBER} eller ${EMERGENCY_CALL_NUMBER}.`} tone="warning" />
      ) : data.services.length > 1 ? (
        <View style={styles.group}>
          <Text style={styles.label}>Behandling</Text>
          <View style={styles.chips}>
            {data.services.map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id === serviceId} onPress={() => { setServiceId(s.id); setStartsAt(null); }} />
            ))}
          </View>
          {errors.serviceId ? <Text style={styles.error}>{errors.serviceId}</Text> : null}
        </View>
      ) : (
        <Text style={styles.body}>Behandling: {data.services[0].name}</Text>
      )}

      {serviceId ? (
        <LoadState {...slots} onRetry={slots.reload}>
          {() =>
            days.length === 0 ? (
              <StatusMessage message="Klinikken har ingen ledige akuttider de næste 14 dage. Vælg en anden klinik eller ring til lægevagten." tone="warning" />
            ) : (
              <SlotPicker days={days} selectedStartsAt={startsAt} onSelect={setStartsAt} error={errors.startsAt} />
            )
          }
        </LoadState>
      ) : null}

      <TextField
        label="Beskriv problemet"
        value={description}
        onChangeText={setDescription}
        error={errors.description}
        multiline
        maxLength={EMERGENCY_DESCRIPTION_LIMITS.max}
      />
      <TextField label="Dit navn" value={name} onChangeText={setName} error={errors.contactName} autoComplete="name" />
      <TextField label="Telefon" value={phone} onChangeText={setPhone} error={errors.contactPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Text style={styles.muted}>Klinikken ser dit navn og telefonnummer, når den har accepteret, og tiden er booket.</Text>

      {!consent ? (
        <ConsentGate type="health_data_sharing" onGrant={() => void grant.run()} pending={grant.pending} error={grant.error} actionLabel="Giv samtykke" />
      ) : (
        <View style={styles.group}>
          <Text style={styles.muted}>{CONSENT_TEXTS.health_data_sharing}</Text>
          {submit.error ? <StatusMessage message={submit.error} tone="danger" /> : null}
          <Button label="Send og reserver tiden" loading={submit.pending} disabled={data.services.length === 0} onPress={() => void submit.run()} />
        </View>
      )}
    </Card>
  );
}

// Login-kravet vises i stedet for formularen, så patienten ikke taster noget, der mistes ved login. Efter login eller oprettelse
// sendes patienten tilbage til akutvejen (`returnTo`).
function LoginRequired() {
  const router = useRouter();
  return (
    <Card>
      <StatusMessage message="Opret en konto eller log ind for at sende en akut henvendelse. Det tager et øjeblik." tone="info" />
      <Button label="Opret konto" onPress={() => router.push({ pathname: "/opret", params: { returnTo: "/akut" } })} />
      <Button label="Log ind" variant="secondary" onPress={() => router.push({ pathname: "/login", params: { returnTo: "/akut" } })} />
    </Card>
  );
}

// Kvittering: tiden er reserveret, ikke bekræftet. Klinikken laver den endelige vurdering.
function Sent({ result, onOpenCase, onOpenBookings }: { result: EmergencyLeadCreatedDto; onOpenCase: () => void; onOpenBookings: () => void }) {
  const booking = result.lead.booking;
  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        Din akutte henvendelse er sendt
      </Text>
      <Card>
        <Text style={type.heading}>{result.lead.clinic.name}</Text>
        {booking ? <Text style={styles.body}>Reserveret tid: {formatDateTime(booking.startsAt)}</Text> : null}
        {booking?.holdExpiresAt ? <Text style={styles.muted}>Reservationen gælder til {formatDateTime(booking.holdExpiresAt)}.</Text> : null}
      </Card>
      <Text style={styles.body}>{EMERGENCY_HOLD_TEXT}</Text>
      <Button label="Se sagen og svaret" onPress={onOpenCase} />
      <Button label="Se mine bookinger" variant="secondary" onPress={onOpenBookings} />
    </>
  );
}

// Akutvejen (architecture 6.1, 10.11, 13.4): fast tekst om 112 og lægevagten, klinikker med ledig akuttid, og én henvendelse med reserveret tid.
export function EmergencyScreen() {
  const router = useRouter();
  const { me } = useSession();
  const account = me !== null && !me.isAnonymous;
  const data = useLoad(() => loadEmergencyData(account), [account]);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [sent, setSent] = useState<EmergencyLeadCreatedDto | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (sent) {
    return (
      <Screen>
        <Sent
          result={sent}
          onOpenCase={() => router.replace({ pathname: "/sag/[caseId]", params: { caseId: sent.caseId } })}
          onOpenBookings={() => router.replace("/bookinger")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackLink label="Forsiden" onPress={back} />
      <Text accessibilityRole="header" style={styles.title}>
        Jeg har ondt
      </Text>
      <EmergencyNotice />
      <Text style={styles.body}>Her kan du sende en akut henvendelse til en klinik med ledig akuttid. Klinikken laver den endelige vurdering.</Text>
      <LoadState {...data} onRetry={data.reload}>
        {(loaded) => {
          const chosen = loaded.clinics.find((c) => c.id === clinicId) ?? null;
          return (
            <>
              <Text style={styles.heading}>Klinikker med ledig akuttid</Text>
              {loaded.clinics.length === 0 ? (
                <>
                  <StatusMessage message="Vi kan ikke finde klinikker med ledig akuttid lige nu. Ring til lægevagten, eller se alle klinikker." tone="warning" />
                  <Button label="Se alle klinikker med akuttid" variant="secondary" onPress={() => router.push({ pathname: "/klinikker", params: { akut: "1" } })} />
                </>
              ) : (
                loaded.clinics.map((c) => <EmergencyClinicOption key={c.id} clinic={c} selected={c.id === clinicId} onPress={() => setClinicId(c.id)} />)
              )}
              {chosen && account ? <EmergencyForm key={chosen.id} clinic={chosen} data={loaded} onSent={setSent} /> : null}
              {chosen && !account ? <LoginRequired /> : null}
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
  body: { ...type.body, color: colors.ink },
  muted: type.caption,
  label: { ...type.caption, fontWeight: "600", color: colors.ink },
  error: { ...type.caption, color: colors.dangerInk },
  group: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
