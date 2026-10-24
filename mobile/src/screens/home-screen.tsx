import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "~/auth/session-context";
import { AnonymousBanner } from "~/components/auth/anonymous-banner";
import { HomeEntries } from "~/components/clinic-directory/home-entries";
import { Screen } from "~/components/ui";
import { colors, fontSize, spacing, type } from "~/theme";

// Tre korte trin (13.9): nummer, titel og én sætning.
const STEPS = [
  { title: "Beskriv", text: "Med dine egne ord eller et billede." },
  { title: "Sammenlign", text: "Priser, anmeldelser og første ledige tid." },
  { title: "Book", text: "Vælg en tid, og få bekræftelse." },
] as const;

// Forside: ordmærke, overskrift, én primær knap og to rolige rækker. Anonyme brugere får en tynd linje nederst.
export function HomeScreen() {
  const router = useRouter();
  const { me } = useSession();
  return (
    <Screen>
      <View style={styles.page}>
        <Text accessibilityRole="header" style={type.wordmark}>
          TandMatch
        </Text>
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={type.display}>
            Find den rigtige tandklinik til en fair pris
          </Text>
          <Text style={type.body}>Se priser og anmeldelser, og book direkte. Du bestemmer selv, hvilke klinikker du vil høre fra.</Text>
        </View>
        <HomeEntries
          onDescribe={() => router.push("/start")}
          onFindClinic={() => router.push("/klinikker")}
          onEmergency={() => router.push("/akut")}
        />
        <View style={styles.steps}>
          <Text style={type.eyebrow}>SÅDAN VIRKER DET</Text>
          {STEPS.map((step, i) => (
            <View key={step.title} style={styles.step}>
              <Text style={styles.number}>{i + 1}</Text>
              <View style={styles.stepText}>
                <Text style={type.label}>{step.title}</Text>
                <Text style={type.caption}>{step.text}</Text>
              </View>
            </View>
          ))}
        </View>
        {me?.isAnonymous ? <AnonymousBanner expiresAt={me.anonymousExpiresAt} onCreateAccount={() => router.push("/opret")} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.xxl, paddingVertical: spacing.lg },
  intro: { gap: spacing.md },
  steps: { gap: spacing.lg },
  step: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  number: { width: 24, fontSize: fontSize.lg, lineHeight: 22, fontWeight: "600", color: colors.brand600 },
  stepText: { flex: 1, gap: 2 },
});
