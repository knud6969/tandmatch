import { StyleSheet, Text, View } from "react-native";
import { OUT_OF_HOURS_HELP_TEXT } from "@/lib/leads/constants/emergency";
import { Button } from "~/components/ui";
import { colors, fontSize, spacing } from "~/theme";

export const NO_OFFERING_TEXT = "Ingen klinikker i området har pris på alle dine behandlinger.";
export const SHOW_OTHERS_LABEL = "Vis også andre klinikker i området";

type Props = {
  // Filteret på behandlinger er i kraft (13.4a): tom tilstand med vej videre.
  onlyOffering: boolean;
  emergency: boolean;
  canWiden: boolean;
  onShowOthers: () => void;
  onWiden: () => void;
};

// Tom liste: med behandlingsfilteret får patienten to veje videre; ellers den almindelige besked.
export function EmptyDirectory({ onlyOffering, emergency, canWiden, onShowOthers, onWiden }: Props) {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{onlyOffering ? NO_OFFERING_TEXT : "Ingen klinikker matcher dine filtre"}</Text>
      {!onlyOffering ? <Text style={styles.muted}>Prøv at ændre eller nulstille filtrene.</Text> : null}
      {emergency ? <Text style={styles.muted}>{OUT_OF_HOURS_HELP_TEXT}</Text> : null}
      {onlyOffering ? <Button label={SHOW_OTHERS_LABEL} onPress={onShowOthers} /> : null}
      {canWiden ? <Button label="Øg afstanden" variant="secondary" onPress={onWiden} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { gap: spacing.md, paddingVertical: spacing.xl },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  muted: { fontSize: fontSize.md, color: colors.inkMuted },
});
