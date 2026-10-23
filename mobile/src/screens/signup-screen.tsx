import { useCallback } from "react";
import { StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { convertAnonymous, signupPatient } from "~/api/auth";
import { useSession } from "~/auth/session-context";
import { SignupForm, type SignupValues } from "~/components/auth/signup-form";
import { BackLink, Button, Screen } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { colors, fontSize } from "~/theme";
import { DEFAULT_RETURN_TO, safeReturnTo } from "~/utils/return-to";

// Opret patientkonto. En anonym session konverteres (beholder kladden), ellers oprettes en ny konto.
export function SignupScreen() {
  const router = useRouter();
  // Kommer patienten fra akutvejen, sendes hun tilbage dertil (kun tilladte stier, se return-to.ts).
  const returnTo = safeReturnTo(useLocalSearchParams<{ returnTo?: string }>().returnTo);
  const { me } = useSession();
  const anonymous = me?.isAnonymous === true;
  const submit = useCallback(
    async (values: SignupValues) => {
      if (anonymous) await convertAnonymous(values);
      else await signupPatient({ role: "patient", ...values });
      return true as const;
    },
    [anonymous],
  );
  const { run, pending, error } = useAction(submit);

  async function onSubmit(values: SignupValues) {
    if (await run(values)) router.replace(returnTo ?? DEFAULT_RETURN_TO);
  }

  return (
    <Screen>
      <BackLink onPress={() => (router.canGoBack() ? router.back() : router.replace("/konto"))} />
      <Text accessibilityRole="header" style={styles.title}>
        Opret konto
      </Text>
      <Text style={styles.body}>
        {anonymous ? "Din samtale gemmes på kontoen." : "Med en konto kan du kontakte klinikker og booke tid."}
      </Text>
      <SignupForm onSubmit={(v) => void onSubmit(v)} pending={pending} error={error} />
      {anonymous ? null : (
        <>
          <Text style={styles.body}>Har du allerede en konto?</Text>
          <Button label="Log ind" variant="secondary" onPress={() => router.replace(returnTo ? { pathname: "/login", params: { returnTo } } : "/login")} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.inkMuted },
});
