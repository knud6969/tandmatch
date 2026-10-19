import { StyleSheet, Text, View } from "react-native";
import { Button } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";
import { formatDateTime } from "~/utils/format";

type Props = { expiresAt: string | null; onCreateAccount: () => void };

// Banner for en anonym session: samtalen er en kladde, der forsvinder, medmindre den gemmes på en konto.
export function AnonymousBanner({ expiresAt, onCreateAccount }: Props) {
  return (
    <View style={styles.box} accessibilityRole="summary">
      <Text style={styles.title}>Du bruger TandMatch uden konto</Text>
      <Text style={styles.text}>
        Din samtale og dine billeder gemmes kun midlertidigt
        {expiresAt ? ` og slettes ${formatDateTime(expiresAt)}` : ""}. Opret en konto for at beholde dem og kontakte klinikker.
      </Text>
      <Button label="Opret konto" onPress={onCreateAccount} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.warningBg, borderColor: colors.warningLine, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: "700", color: colors.warningInk },
  text: { fontSize: fontSize.md, color: colors.warningInk },
});
