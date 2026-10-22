import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CONSENT_TEXTS } from "@/lib/identity/constants/consents";
import { LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import { hasCurrentConsent } from "@/lib/identity/domain/consents";
import { remainingLeadSlots } from "@/lib/leads/domain/leads";
import type { CaseDto } from "@/lib/cases/types/cases";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import type { PatientLeadDto } from "@/lib/leads/types/leads";
import { convertAnonymous } from "~/api/auth";
import { getCase } from "~/api/cases";
import { listClinics } from "~/api/clinics";
import { ApiRequestError } from "~/api/client";
import { getConsents, grantConsent } from "~/api/consents";
import { listCaseLeads, sendLeads } from "~/api/leads";
import { useSession } from "~/auth/session-context";
import { SignupForm, type SignupValues } from "~/components/auth/signup-form";
import { ConsentGate } from "~/components/case/consent-gate";
import { BackLink, Badge, Button, Card, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize, spacing } from "~/theme";
import { PRICE_SOURCE } from "~/utils/clinic-texts";
import { formatPriceRange } from "~/utils/format";
import { clearSelection, clinicsWord, parseClinicIds, SEND_BLOCK_TEXT, sendBlockReason } from "~/utils/lead-selection";

// Alt skærmen skal bruge, hentes samlet så den kan vises i ét hug.
type Loaded = { caseDto: CaseDto; clinics: ClinicListItemDto[]; contacted: string[]; consent: boolean };

// Henter sagen, tidligere leads, samtykke og de valgte klinikker (med pris for patientens ydelser).
async function loadSendData(caseId: string, ids: string[]): Promise<Loaded> {
  const caseDto = await getCase(caseId);
  const [leads, consents, list] = await Promise.all([
    listCaseLeads(caseId).catch(() => []),
    getConsents().catch(() => []), // en anonym patient har intet at hente; samtykket gives efter kontoen
    ids.length > 0
      ? listClinics(new URLSearchParams({ ids: ids.join(","), services: caseDto.services.map((s) => s.slug).join(",") }).toString())
      : Promise.resolve({ clinics: [] as ClinicListItemDto[] }),
  ]);
  return {
    caseDto,
    clinics: list.clinics,
    contacted: leads.filter((l) => !l.clinic.removed).map((l) => l.clinic.id),
    consent: hasCurrentConsent(consents, "health_data_sharing"),
  };
}

// Kort for en valgt klinik; prisen vises altid med kilde (architecture 7.4).
function ClinicLine({ clinic }: { clinic: ClinicListItemDto }) {
  return (
    <Card>
      <Text style={styles.name}>{clinic.name}</Text>
      <Text style={styles.muted}>
        {clinic.address}, {clinic.postalCode} {clinic.city}
      </Text>
      {clinic.priceForSelection ? (
        <Text style={styles.body}>
          <Text style={styles.strong}>{formatPriceRange(clinic.priceForSelection.min, clinic.priceForSelection.max)}</Text> for dit valg, {PRICE_SOURCE}
        </Text>
      ) : (
        <Text style={styles.muted}>Prisen for dit valg er ikke angivet i klinikkens prisliste</Text>
      )}
    </Card>
  );
}

// Kvittering efter afsendelse; klinikken laver den endelige vurdering.
function Sent({ leads, onOpen }: { leads: PatientLeadDto[]; onOpen: () => void }) {
  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        Din sag er sendt
      </Text>
      <Text style={styles.body}>
        Vi har sendt din godkendte beskrivelse til {clinicsWord(leads.length)}. Klinikken laver den endelige vurdering og svarer dig her på TandMatch.
      </Text>
      {leads.map((lead) => (
        <Card key={lead.id}>
          <Text style={styles.name}>{lead.clinic.name}</Text>
          <Text style={styles.muted}>{lead.clinic.city}</Text>
          <Badge label={LEAD_STATUS_LABEL[lead.status]} tone="info" />
        </Card>
      ))}
      <Button label="Gå til Mine sager" onPress={onOpen} />
    </>
  );
}

// Afsendelse til de valgte klinikker (architecture 10.5, 13.4): konto (convert for en anonym patient, så sagen følger med),
// samtykke til deling af helbredsdata og send. Klinikken ser først navn og kontaktoplysninger, når en tid er booket.
export function SendScreen() {
  const router = useRouter();
  const { caseId, klinikker } = useLocalSearchParams<{ caseId: string; klinikker?: string }>();
  const ids = parseClinicIds(klinikker);
  const idsKey = ids.join(",");
  const { me } = useSession();
  const loader = useCallback(() => loadSendData(caseId, idsKey === "" ? [] : idsKey.split(",")), [caseId, idsKey]);
  const loaded = useLoad(loader, [loader]);
  const [consentNow, setConsentNow] = useState<boolean | null>(null);
  const [sent, setSent] = useState<PatientLeadDto[] | null>(null);

  const convert = useCallback(async (values: SignupValues) => {
    await convertAnonymous(values);
    return true as const;
  }, []);
  const signup = useAction(convert);
  const grant = useAction(async () => {
    await grantConsent("health_data_sharing");
    return true as const;
  });
  // Serveren er den endelige vagt for samtykke; mangler det, vises samtykke-kortet igen i stedet for en fejl.
  const send = useAction(async () => {
    try {
      return await sendLeads(caseId, ids);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "CONSENT_REQUIRED") setConsentNow(false); // viser samtykke-gaten igen
      throw e;
    }
  });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/klinikker", params: { sag: caseId } }));
  const anonymous = me?.isAnonymous === true;

  async function onSignup(values: SignupValues) {
    if (await signup.run(values)) loaded.reload();
  }
  async function onGrant() {
    if (await grant.run()) setConsentNow(true);
  }
  async function onSend() {
    const leads = await send.run();
    if (leads) {
      clearSelection(caseId);
      setSent(leads);
    }
  }

  return (
    <Screen>
      {sent ? (
        <Sent leads={sent} onOpen={() => router.replace("/sager")} />
      ) : (
        <>
          <BackLink label="Ret dit valg" onPress={goBack} />
          <LoadState {...loaded} onRetry={loaded.reload}>
            {(data) => {
              const slots = remainingLeadSlots(data.caseDto.leadCount, data.caseDto.totalLeadCount);
              const block = sendBlockReason(data.caseDto, ids, data.clinics, data.contacted, slots);
              if (block) {
                return (
                  <>
                    <StatusMessage message={SEND_BLOCK_TEXT[block]} tone="warning" />
                    <Button label="Vælg klinikker" variant="secondary" onPress={goBack} />
                  </>
                );
              }
              const chosen = ids.map((id) => data.clinics.find((c) => c.id === id)).filter((c): c is ClinicListItemDto => c !== undefined);
              const consentGiven = consentNow ?? data.consent;
              return (
                <>
                  <Text accessibilityRole="header" style={styles.title}>
                    Du sender til {clinicsWord(chosen.length)}
                  </Text>
                  {chosen.map((clinic) => (
                    <ClinicLine key={clinic.id} clinic={clinic} />
                  ))}
                  <StatusMessage
                    tone="info"
                    message="Det deler vi med klinikkerne: din godkendte opsummering, dine behandlinger, dit tidsrum, dit postnummer og dine billeder. Din chat deles ikke. Klinikken ser først dit navn og dine kontaktoplysninger, når den har accepteret, og en tid er booket. Klinikken laver den endelige vurdering."
                  />
                  {anonymous ? (
                    <View style={styles.section}>
                      <Text accessibilityRole="header" style={styles.name}>
                        Opret en konto for at sende
                      </Text>
                      <Text style={styles.muted}>Din samtale og din beskrivelse gemmes på kontoen.</Text>
                      <SignupForm onSubmit={(v) => void onSignup(v)} pending={signup.pending} error={signup.error} submitLabel="Opret konto og fortsæt" />
                    </View>
                  ) : !consentGiven ? (
                    <ConsentGate type="health_data_sharing" onGrant={() => void onGrant()} pending={grant.pending} error={send.error ?? grant.error} actionLabel="Giv samtykke" />
                  ) : (
                    <View style={styles.section}>
                      <Text style={styles.muted}>{CONSENT_TEXTS.health_data_sharing}</Text>
                      {send.error ? <StatusMessage message={send.error} tone="danger" /> : null}
                      <Button label={`Send til ${clinicsWord(chosen.length)}`} loading={send.pending} onPress={() => void onSend()} />
                      <Text style={styles.muted}>Du kan trække en henvendelse tilbage, indtil klinikken har svaret.</Text>
                    </View>
                  )}
                </>
              );
            }}
          </LoadState>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  name: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  strong: { fontWeight: "700", color: colors.ink },
  section: { gap: spacing.md },
});
