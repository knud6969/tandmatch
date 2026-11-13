import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { hasCurrentConsent } from "@/lib/identity/domain/consents";
import type { EmergencyLeadCreatedDto } from "@/lib/leads/types/leads";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import type { ServiceDto } from "@/lib/clinics/types/services";
import { EMERGENCY_CALL_NUMBER, OUT_OF_HOURS_NUMBER } from "@/lib/leads/constants/emergency";
import { sendEmergencyLead } from "~/api/emergency";
import { listClinics } from "~/api/clinics";
import { ApiRequestError } from "~/api/client";
import { getConsents, grantConsent } from "~/api/consents";
import { getPatientMe } from "~/api/patients";
import { getServiceGroups } from "~/api/services";
import { useSession } from "~/auth/session-context";
import { PushPrompt } from "~/components/notifications/push-prompt";
import { ConsentGate } from "~/components/case/consent-gate";
import { EmergencyNotice } from "~/components/clinic-directory/emergency-notice";
import { EmergencyClinicOption } from "~/components/emergency/emergency-clinic-option";
import { BackLink, Button, Card, Chip, FieldError, LoadState, Screen, StatusMessage, TextField } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { colors, spacing, type } from "~/theme";
import {
  EMERGENCY_DESCRIPTION_LIMITS,
  EMERGENCY_NEXT_TEXT,
  emergencyClinicsQuery,
  emergencyServices,
  parseEmergency,
  selectableEmergencyClinics,
  type EmergencyField,
} from "~/utils/emergency-form";
import type { FieldErrors } from "~/utils/field-errors";

type Loaded = { services: ServiceDto[]; clinics: ClinicListItemDto[]; name: string; phone: string; consent: boolean };

// Henter akutbehandlinger, klinikker der tager imod akutte patienter (nærmeste først, hvis patienten har et postnummer), kontaktoplysninger og samtykke.
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

// Formularen for den valgte klinik: behandling, beskrivelse og kontaktoplysninger. Sendes til netop denne klinik, som foreslår en tid.
function EmergencyForm({ clinic, data, onSent }: { clinic: ClinicListItemDto; data: Loaded; onSent: (r: EmergencyLeadCreatedDto) => void }) {
  const [serviceId, setServiceId] = useState<string | null>(data.services.length === 1 ? data.services[0].id : null);
  const [description, setDescription] = useState("");
  const [name, setName] = useState(data.name);
  const [phone, setPhone] = useState(data.phone);
  const [consent, setConsent] = useState(data.consent);
  const [errors, setErrors] = useState<FieldErrors<EmergencyField>>({});

  const grant = useAction(async () => {
    await grantConsent("health_data_sharing");
    setConsent(true);
  });
  const submit = useAction(async () => {
    const parsed = parseEmergency({ clinicId: clinic.id, serviceId, description, contactName: name, contactPhone: phone });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    try {
      onSent(await sendEmergencyLead(parsed.data));
    } catch (e) {
      // Samtykket mangler: vis samtykket igen, og vis serverens danske tekst.
      if (e instanceof ApiRequestError && e.code === "CONSENT_REQUIRED") {
        setConsent(false);
      }
      throw e;
    }
  });

  return (
    <Card>
      <Text style={type.heading}>Akut henvendelse til {clinic.name}</Text>

      {data.services.length === 0 ? (
        <StatusMessage message={`Der er ingen akutbehandlinger i kataloget lige nu. Ring ${OUT_OF_HOURS_NUMBER} eller ${EMERGENCY_CALL_NUMBER}.`} tone="warning" />
      ) : data.services.length > 1 ? (
        <View style={styles.group}>
          <Text style={styles.label}>Behandling</Text>
          <View style={styles.chips}>
            {data.services.map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id === serviceId} onPress={() => setServiceId(s.id)} />
            ))}
          </View>
          {errors.serviceId ? <FieldError message={errors.serviceId} /> : null}
        </View>
      ) : (
        <Text style={styles.body}>Behandling: {data.services[0].name}</Text>
      )}

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
      <Text style={styles.muted}>Klinikken foreslår en tid, som du bekræfter. Den ser dit navn og nummer, når du har bekræftet tiden.</Text>

      {!consent ? (
        <ConsentGate type="health_data_sharing" onGrant={() => void grant.run()} pending={grant.pending} error={grant.error} actionLabel="Giv samtykke" />
      ) : (
        <View style={styles.group}>
          {submit.error ? <StatusMessage message={submit.error} tone="danger" /> : null}
          <Button label="Send akut henvendelse" loading={submit.pending} disabled={data.services.length === 0} onPress={() => void submit.run()} />
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
      <StatusMessage message="Log ind for at sende en akut henvendelse." tone="info" />
      <Button label="Opret konto" onPress={() => router.push({ pathname: "/opret", params: { returnTo: "/akut" } })} />
      <Button label="Log ind" variant="secondary" onPress={() => router.push({ pathname: "/login", params: { returnTo: "/akut" } })} />
    </Card>
  );
}

// Kvittering: henvendelsen er sendt; klinikken foreslår en tid. Klinikken laver den endelige vurdering.
function Sent({ result, onOpenCase }: { result: EmergencyLeadCreatedDto; onOpenCase: () => void }) {
  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        Din akutte henvendelse er sendt
      </Text>
      <Card>
        <Text style={type.heading}>{result.lead.clinic.name}</Text>
      </Card>
      <Text style={styles.body}>{EMERGENCY_NEXT_TEXT}</Text>
      <PushPrompt />
      <Button label="Se sagen og svaret" onPress={onOpenCase} />
    </>
  );
}

// Akutvejen (architecture 6.1, 10.11, 13.4): fast tekst om 112 og lægevagten, klinikker der tager imod akutte patienter, og én
// henvendelse uden tid. Klinikken foreslår tiden, og patienten bekræfter den under sagen.
export function EmergencyScreen() {
  const router = useRouter();
  const { status } = useSession();
  const account = status === "account";
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
      <LoadState {...data} onRetry={data.reload}>
        {(loaded) => {
          const chosen = loaded.clinics.find((c) => c.id === clinicId) ?? null;
          return (
            <>
              <Text style={styles.heading}>Klinikker, der tager imod akutte patienter</Text>
              {loaded.clinics.length === 0 ? (
                <>
                  <StatusMessage message="Ingen klinikker i nærheden tager imod akutte patienter via TandMatch lige nu." tone="warning" />
                  <Button label="Se alle klinikker med akuthjælp" variant="secondary" onPress={() => router.push({ pathname: "/klinikker", params: { akut: "1" } })} />
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
  group: { gap: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
