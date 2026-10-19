import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AI_BOUNDARY_TEXT } from "@/lib/constants/ai-texts";
import { START_STEPS } from "@/lib/constants/start";
import { startAnonymousSession } from "~/api/auth";
import { createCase, listCases } from "~/api/cases";
import { useSession } from "~/auth/session-context";
import { ConsentGate } from "~/components/case/consent-gate";
import { BackLink, Button, Card, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize, spacing } from "~/theme";

const flowHref = (caseId: string) => ({ pathname: "/sag/[caseId]/flow", params: { caseId } }) as const;

// Anonym: særskilt AI-samtykke og en anonym session med en tom sag (architecture 6.1, 10.2, 13.3).
function AnonymousStart({ onStarted }: { onStarted: (caseId: string) => void }) {
  const start = useAction(async () => onStarted((await startAnonymousSession()).caseId));
  return (
    <View style={styles.gap}>
      <ConsentGate type="ai_processing" actionLabel="Start samtalen" onGrant={() => void start.run()} pending={start.pending} error={start.error} />
      <Text style={styles.muted}>
        Du giver ikke samtykke til billeder her. Det spørger vi om særskilt, hvis du vil uploade et billede.
      </Text>
    </View>
  );
}

// Anonym med eksisterende kladde: samme kald er idempotent og returnerer den eksisterende sag.
function ContinueAnonymous({ onStarted }: { onStarted: (caseId: string) => void }) {
  const resume = useAction(async () => onStarted((await startAnonymousSession()).caseId));
  return (
    <Card>
      <Text style={styles.h2}>Du har en igangværende samtale</Text>
      <Text style={styles.body}>Din anonyme samtale gemmes i 48 timer. Du kan fortsætte, hvor du slap.</Text>
      {resume.error ? <StatusMessage message={resume.error} tone="danger" /> : null}
      <Button label="Fortsæt samtalen" loading={resume.pending} onPress={() => void resume.run()} />
    </Card>
  );
}

// Patient med konto: fortsæt en kladde eller start en ny sag. AI-samtykket gives i chatten, første gang det mangler.
function AccountStart({ onStarted }: { onStarted: (caseId: string) => void }) {
  const cases = useLoad(listCases);
  const create = useAction(async () => onStarted((await createCase()).id));
  return (
    <LoadState loading={cases.loading} error={cases.error} data={cases.data} onRetry={cases.reload}>
      {(items) => {
        const drafts = items.filter((c) => c.status === "draft");
        return (
          <View style={styles.gap}>
            {drafts.length > 0 ? (
              <Card>
                <Text style={styles.h2}>Fortsæt en igangværende sag</Text>
                {drafts.map((draft) => (
                  <Button
                    key={draft.id}
                    variant="secondary"
                    label={`Fortsæt kladde${draft.serviceNames.length ? `: ${draft.serviceNames.join(", ")}` : ""}`}
                    onPress={() => onStarted(draft.id)}
                  />
                ))}
              </Card>
            ) : null}
            <Card>
              <Text style={styles.h2}>Start en ny sag</Text>
              <Text style={styles.body}>Du bliver bedt om samtykke til AI-behandling, første gang du skriver til AI-assistenten.</Text>
              {create.error ? <StatusMessage message={create.error} tone="danger" /> : null}
              <Button label="Start samtalen" loading={create.pending} onPress={() => void create.run()} />
            </Card>
          </View>
        );
      }}
    </LoadState>
  );
}

// "Beskriv dit problem" (architecture 6.1 /start, 13.3): forklaring og indgang til sagsflowet.
export function StartScreen() {
  const router = useRouter();
  const { me } = useSession();
  const open = (caseId: string) => {
    router.replace(flowHref(caseId));
  };

  return (
    <Screen>
      <BackLink label="Tilbage" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <Text accessibilityRole="header" style={styles.title}>
        Beskriv dit problem
      </Text>
      <Text style={styles.body}>Fortæl, hvad du oplever, eller hvad du gerne vil have lavet. Du kan starte uden at oprette en konto.</Text>
      <View style={styles.steps}>
        {START_STEPS.map((step, i) => (
          <Text key={step} style={styles.body}>
            {i + 1}. {step}
          </Text>
        ))}
      </View>
      <StatusMessage message={`${AI_BOUNDARY_TEXT} AI-assistenten anbefaler ikke bestemte klinikker og nævner ikke priser.`} />
      {me?.isAnonymous ? <ContinueAnonymous onStarted={open} /> : me ? <AccountStart onStarted={open} /> : <AnonymousStart onStarted={open} />}
      <Button label="Gå til klinikoversigten" variant="secondary" onPress={() => router.push("/klinikker")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  steps: { gap: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  h2: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, lineHeight: 22, color: colors.inkMuted },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
});
