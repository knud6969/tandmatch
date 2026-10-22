import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { login } from "~/api/auth";
import { CLINIC_ON_WEB_MESSAGE } from "~/auth/session-context";
import { LoginForm } from "~/components/auth/login-form";
import { BackLink, Button, Screen } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { colors, fontSize } from "~/theme";

// Log ind som patient. Klinikker logger ind på weben, så de får en forklaring i stedet for en fejl (architecture 13.3).
export function LoginScreen() {
  const router = useRouter();
  const [clinicNotice, setClinicNotice] = useState<string | null>(null);
  // Nulstiller klinikbeskeden, så en gammel besked ikke bliver stående ved nyt forsøg.
  const submit = useCallback(async (values: { email: string; password: string }) => {
    setClinicNotice(null);
    return login(values);
  }, []);
  const { run, pending, error } = useAction(submit);

  async function onSubmit(values: { email: string; password: string }) {
    const outcome = await run(values);
    if (outcome === "not_patient") setClinicNotice(CLINIC_ON_WEB_MESSAGE);
    else if (outcome === "ok") router.replace("/konto");
  }

  return (
    <Screen>
      <BackLink onPress={() => (router.canGoBack() ? router.back() : router.replace("/konto"))} />
      <Text accessibilityRole="header" style={styles.title}>
        Log ind
      </Text>
      <LoginForm onSubmit={(v) => void onSubmit(v)} pending={pending} error={error ?? clinicNotice} />
      <Text style={styles.muted}>Har du ikke en konto endnu?</Text>
      <Button label="Opret konto" variant="secondary" onPress={() => router.replace("/opret")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  muted: { fontSize: fontSize.md, color: colors.inkMuted },
});
