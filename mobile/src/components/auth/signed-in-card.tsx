import { StyleSheet, Text } from "react-native";
import type { MeDto } from "@/lib/identity/types/auth";
import { Button, Card } from "~/components/ui";
import { colors, fontSize } from "~/theme";
import { signedInLabel } from "~/utils/session-status";

type Props = { me: MeDto; onContinue: () => void; onLogout: () => void; loggingOut: boolean };

// Vises på login- og opret-skærmen, når patienten allerede har en konto, så hun aldrig bliver bedt om at oprette en igen.
export function SignedInCard({ me, onContinue, onLogout, loggingOut }: Props) {
  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        Du er logget ind som {signedInLabel(me)}
      </Text>
      <Button label="Fortsæt" onPress={onContinue} />
      <Button label="Log ud" variant="secondary" loading={loggingOut} onPress={onLogout} />
    </Card>
  );
}

const styles = StyleSheet.create({ title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink } });
