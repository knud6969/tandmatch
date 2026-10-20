import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { logout } from "~/api/auth";
import type { PatientMeDto } from "@/lib/types/patients";
import { getPatientMe, patchPatientMe } from "~/api/patients";
import { useSession } from "~/auth/session-context";
import { AnonymousBanner } from "~/components/auth/anonymous-banner";
import { ProfileForm } from "~/components/auth/profile-form";
import { Button, Card, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize } from "~/theme";

// Samme felter som API'et accepterer, så skærmen ikke gentager typen.
type Patch = Parameters<typeof patchPatientMe>[0];

// Profilformularen; den gemte version vises straks, uden at hente profilen igen.
function Profile() {
  const profile = useLoad(getPatientMe);
  const [updated, setUpdated] = useState<PatientMeDto | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useCallback(async (patch: Patch) => {
    setUpdated(await patchPatientMe(patch));
    return true as const;
  }, []);
  const { run, pending, error } = useAction(save);
  return (
    <LoadState {...profile} onRetry={profile.reload}>
      {(loaded) => {
        const data = updated ?? loaded;
        return (
          <ProfileForm
            // Ny key nulstiller formularens felter, når de gemte værdier ændrer sig.
            key={`${data.firstName}|${data.postalCode}|${data.phone}`}
            profile={data}
            pending={pending}
            error={error}
            saved={saved}
            onSave={(patch) => {
              setSaved(false);
              void run(patch).then((ok) => setSaved(ok === true));
            }}
          />
        );
      }}
    </LoadState>
  );
}

// Konto: log ind/opret for gæster, opfordring til at oprette konto for anonyme og profil for patienter med konto.
export function AccountScreen() {
  const router = useRouter();
  const { me, ready, notice, retryable, reload } = useSession();
  const { run: doLogout, pending: loggingOut } = useAction(logout);

  if (!ready) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Konto
      </Text>
      {retryable ? (
        <>
          <StatusMessage message="Vi kunne ikke hente din konto lige nu." tone="danger" />
          <Button label="Prøv igen" variant="secondary" onPress={reload} />
        </>
      ) : me === null ? (
        <>
          {notice ? <StatusMessage message={notice} tone="warning" /> : null}
          <Card>
            <Text style={styles.heading}>Du er ikke logget ind</Text>
            <Text style={styles.body}>Log ind eller opret en konto for at kontakte klinikker, booke tid og skrive anmeldelser.</Text>
            <Button label="Log ind" onPress={() => router.push("/login")} />
            <Button label="Opret konto" variant="secondary" onPress={() => router.push("/opret")} />
          </Card>
        </>
      ) : (
        <>
          {me.isAnonymous ? (
            <AnonymousBanner expiresAt={me.anonymousExpiresAt} onCreateAccount={() => router.push("/opret")} />
          ) : (
            <>
              <Text style={styles.heading}>{me.displayName ? `Hej ${me.displayName}` : "Din konto"}</Text>
              <Profile />
            </>
          )}
          <Button label="Log ud" variant="secondary" loading={loggingOut} onPress={() => void doLogout()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  heading: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.inkMuted },
});
