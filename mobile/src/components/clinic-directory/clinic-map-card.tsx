import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { Badge, Button } from "~/components/ui";
import { colors, radius, spacing, type } from "~/theme";
import { BASIC_CLINIC_LABEL, PRICE_SOURCE, VERIFIED_CLINIC_LABEL } from "@/lib/clinics/constants/clinic-texts";
import { formatKm, formatPriceRange } from "@/lib/common/domain/format";

type Props = {
  clinic: ClinicListItemDto;
  hasServices: boolean;
  onOpenProfile: () => void;
  onClose: () => void;
  // "Vælg klinik" fra sagen, med samme regler som i listen (leveres af skærmen).
  action?: ReactNode;
};

// Lille kort under kortet for den valgte markør: navn, pris for valget (som i listen), afstand og "Se profil".
export function ClinicMapCard({ clinic, hasServices, onOpenProfile, onClose, action }: Props) {
  const full = clinic.tier === "full";
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.top}>
        <Badge label={full ? VERIFIED_CLINIC_LABEL : BASIC_CLINIC_LABEL} tone={full ? "info" : "warning"} />
        <Button label="Luk" variant="text" onPress={onClose} accessibilityLabel={`Luk kortet for ${clinic.name}`} />
      </View>
      <Text style={type.title}>{clinic.name}</Text>
      <Text style={type.caption}>
        {clinic.address}, {clinic.postalCode} {clinic.city}
        {clinic.distanceKm !== null ? ` · ${formatKm(clinic.distanceKm)}` : ""}
      </Text>
      {full ? (
        clinic.priceForSelection ? (
          <Text style={type.caption}>
            <Text style={type.label}>{formatPriceRange(clinic.priceForSelection.min, clinic.priceForSelection.max)}</Text> for dit valg, {PRICE_SOURCE}
          </Text>
        ) : (
          <Text style={type.caption}>
            {hasServices ? "Prisen for dit valg er ikke angivet i klinikkens prisliste" : `Vælg en behandling for at se prisen, ${PRICE_SOURCE}`}
          </Text>
        )
      ) : null}
      <Button label="Se profil" variant={action ? "secondary" : "primary"} onPress={onOpenProfile} accessibilityLabel={`Se profil for ${clinic.name}`} />
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand200, backgroundColor: colors.surface },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
