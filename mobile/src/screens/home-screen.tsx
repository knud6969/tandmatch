import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MAX_ACTIVE_LEADS_PER_CASE } from "@/lib/constants/limits";
import { useSession } from "~/auth/session-context";
import { AnonymousBanner } from "~/components/auth/anonymous-banner";
import { HomeEntries } from "~/components/clinic-directory/home-entries";
import { Card, Screen } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";

// Samme fire trin som forsiden på weben (views/pages/page.tsx).
const STEPS = [
  { title: "Beskriv problemet", text: "Skriv med dine egne ord eller upload et billede. AI hjælper dig med at sætte ord på det." },
  { title: "Sammenlign klinikker", text: "Se priser fra klinikkens prisliste, anmeldelser og første ledige tid side om side." },
  { title: `Kontakt op til ${MAX_ACTIVE_LEADS_PER_CASE} klinikker`, text: "Send din beskrivelse til de klinikker, du vil høre fra. De svarer med deres egen vurdering." },
  { title: "Book din tid", text: "Vælg en ledig tid, og få bekræftelse. Bagefter kan du anmelde besøget." },
] as const;

// Forside: forklarer platformen og giver tre indgange (beskriv, find klinik, akut). Anonyme brugere får en opfordring til at oprette konto.
export function HomeScreen() {
  const router = useRouter();
  const { me } = useSession();
  return (
    <Screen>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.title}>
          Find den rigtige tandlæge til en fair pris
        </Text>
        <Text style={styles.body}>
          Se priser, anmeldelser og ledige tider på ét sted, og book direkte. Du bestemmer selv, hvilke klinikker du vil høre fra.
        </Text>
        <HomeEntries
          onDescribe={() => router.push("/start")}
          onFindClinic={() => router.push("/klinikker")}
          onEmergency={() => router.push({ pathname: "/klinikker", params: { akut: "1" } })}
        />
        <Text style={styles.note}>“Jeg har ondt” viser klinikker med akuttid. Ved livstruende symptomer ring 112.</Text>
      </View>
      {me?.isAnonymous ? <AnonymousBanner expiresAt={me.anonymousExpiresAt} onCreateAccount={() => router.push("/opret")} /> : null}
      <Text accessibilityRole="header" style={styles.h2}>
        Sådan virker det
      </Text>
      {STEPS.map((step, i) => (
        <Card key={step.title}>
          <Text style={styles.step}>Trin {i + 1}</Text>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.body}>{step.text}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand50, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink, lineHeight: 34 },
  body: { fontSize: fontSize.md, color: colors.inkMuted, lineHeight: 22 },
  note: { fontSize: fontSize.sm, color: colors.inkMuted },
  h2: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  step: { fontSize: fontSize.sm, fontWeight: "700", color: colors.brand700 },
  stepTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
});
