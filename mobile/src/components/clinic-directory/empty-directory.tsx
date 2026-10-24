import { StyleSheet, Text, View } from "react-native";
import { OUT_OF_HOURS_HELP_TEXT } from "@/lib/leads/constants/emergency";
import { Button } from "~/components/ui";
import { searchSummary, type DirectoryFilters } from "~/utils/clinic-filters";
import { colors, radius, spacing, type } from "~/theme";

export const NO_OFFERING_TEXT = "Ingen klinikker i området har pris på alle dine behandlinger.";
export const SHOW_OTHERS_LABEL = "Vis også andre klinikker i området";

type Props = {
  // Filteret på behandlinger er i kraft (13.4a): tom tilstand med vej videre.
  onlyOffering: boolean;
  emergency: boolean;
  filters: DirectoryFilters;
  serviceNames: Map<string, string>;
  canWiden: boolean;
  onShowOthers: () => void;
  onWiden: () => void;
};

// Tom liste: med behandlingsfilteret får patienten to veje videre; ellers den almindelige besked.
export function EmptyDirectory({ onlyOffering, emergency, filters, serviceNames, canWiden, onShowOthers, onWiden }: Props) {
  return (
    <View style={styles.empty}>
      <Text style={type.heading}>{onlyOffering ? NO_OFFERING_TEXT : "Ingen klinikker matcher dine filtre"}</Text>
      {!onlyOffering ? <Text style={type.body}>Prøv at ændre eller nulstille filtrene.</Text> : null}
      <View style={styles.summary} accessibilityLabel="Det blev der søgt på">
        <Text style={type.label}>Der blev søgt på</Text>
        {searchSummary(filters, serviceNames).map((line) => (
          <Text key={line.label} style={type.caption}>
            {line.label}: {line.value}
          </Text>
        ))}
      </View>
      {emergency ? <Text style={type.body}>{OUT_OF_HOURS_HELP_TEXT}</Text> : null}
      {onlyOffering ? <Button label={SHOW_OTHERS_LABEL} onPress={onShowOthers} /> : null}
      {canWiden ? <Button label="Øg afstanden" variant="secondary" onPress={onWiden} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { gap: spacing.md, paddingVertical: spacing.xl },
  summary: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
});
