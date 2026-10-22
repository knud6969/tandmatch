import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { FIRST_AVAILABLE_SEARCH_DAYS } from "@/lib/booking/constants/bookings";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { Badge } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";
import { BASIC_CLINIC_FACTS_TEXT, BASIC_CLINIC_LABEL, NO_REVIEWS_TEXT, PRICE_SOURCE, VERIFIED_CLINIC_LABEL } from "~/utils/clinic-texts";
import { formatKm, formatPercent, formatPriceRange, formatShortDateTime } from "~/utils/format";
import { StarRating } from "./star-rating";
import { TrustpilotLine } from "./trustpilot-block";

type Props = {
  clinic: ClinicListItemDto;
  // Patienten har valgt behandlinger, så prisen for valget kan vises.
  hasServices: boolean;
  // Akutfilteret er slået til: vis første akuttid i stedet for første ledige tid.
  emergency: boolean;
  onPress: () => void;
};

// Klinikkort i Airbnb-stil. Verificerede klinikker har logo, blå kant og mærket "Verificeret klinik"; basisklinikker er
// dæmpede, stiplede og uden billede, og siger tydeligt, at de ikke er på TandMatch endnu.
export function ClinicCard({ clinic, hasServices, emergency, onPress }: Props) {
  const full = clinic.tier === "full";
  const stats = clinic.reviewStats;
  // Akutfilteret viser første akuttid; ellers første ledige tid.
  const nextAt = emergency ? clinic.firstEmergencyAt : clinic.firstAvailableAt;
  // Samlet tekst til skærmlæseren, så kortet læses op som én sætning.
  const where = `${clinic.address}, ${clinic.postalCode} ${clinic.city}${clinic.distanceKm !== null ? `, ${formatKm(clinic.distanceKm)} væk` : ""}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${clinic.name}, ${full ? VERIFIED_CLINIC_LABEL : BASIC_CLINIC_LABEL}. ${where}`}
      accessibilityHint="Åbner klinikkens profil"
      onPress={onPress}
      style={({ pressed }) => [styles.card, full ? styles.full : styles.basic, pressed && styles.pressed]}
    >
      {/* Basisklinikker har intet billede, kun et neutralt tegn, så de ikke ligner verificerede klinikker. */}
      <View style={[styles.hero, full ? styles.heroFull : styles.heroBasic]}>
        {full && clinic.logoUrl ? (
          <Image source={{ uri: clinic.logoUrl }} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
        ) : (
          <Text style={[styles.glyph, { color: full ? colors.brand700 : colors.inkMuted }]}>✚</Text>
        )}
      </View>
      <View style={styles.body}>
        <Badge label={full ? VERIFIED_CLINIC_LABEL : BASIC_CLINIC_LABEL} tone={full ? "info" : "warning"} />
        <Text style={styles.name}>{clinic.name}</Text>
        <Text style={styles.muted}>
          {clinic.address}, {clinic.postalCode} {clinic.city}
          {clinic.distanceKm !== null ? <Text style={styles.strong}> · {formatKm(clinic.distanceKm)}</Text> : null}
        </Text>

        {full ? (
          <>
            {stats && stats.reviewCount > 0 && stats.avgStars !== null ? (
              <View style={styles.gap}>
                <StarRating value={stats.avgStars} count={stats.reviewCount} />
                <Text style={styles.muted}>verificerede anmeldelser</Text>
                {stats.priceAccuracyPct !== null ? <Text style={styles.muted}>Prisnøjagtighed {formatPercent(stats.priceAccuracyPct)}</Text> : null}
              </View>
            ) : (
              <Text style={styles.muted}>{NO_REVIEWS_TEXT}</Text>
            )}
            {clinic.priceForSelection ? (
              <Text style={styles.body2}>
                <Text style={styles.price}>{formatPriceRange(clinic.priceForSelection.min, clinic.priceForSelection.max)}</Text>
                <Text style={styles.muted}> for dit valg, {PRICE_SOURCE}</Text>
              </Text>
            ) : (
              <Text style={styles.muted}>
                {hasServices ? "Prisen for dit valg er ikke angivet i klinikkens prisliste" : `Vælg en behandling for at se prisen, ${PRICE_SOURCE}`}
              </Text>
            )}
            <Text style={styles.body2}>
              <Text style={styles.muted}>{emergency ? "Første akuttid: " : hasServices ? "Første ledige tid: " : "Første ledige tid (undersøgelse): "}</Text>
              {nextAt ? (
                <Text style={styles.strong}>{formatShortDateTime(nextAt)}</Text>
              ) : (
                <Text style={styles.muted}>
                  {emergency ? `ingen akuttid de næste ${FIRST_AVAILABLE_SEARCH_DAYS} dage` : `ingen ledige tider de næste ${FIRST_AVAILABLE_SEARCH_DAYS} dage`}
                </Text>
              )}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>{BASIC_CLINIC_FACTS_TEXT}</Text>
        )}
        <TrustpilotLine trustpilot={clinic.trustpilot} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1 },
  full: { borderColor: colors.brand200, backgroundColor: colors.surface },
  basic: { borderColor: colors.fieldBorder, borderStyle: "dashed", backgroundColor: colors.surfaceMuted },
  pressed: { opacity: 0.9 },
  hero: { height: 120, alignItems: "center", justifyContent: "center" },
  heroFull: { backgroundColor: colors.brand50 },
  heroBasic: { backgroundColor: colors.line },
  logo: { width: "70%", height: "70%" },
  glyph: { fontSize: 48 },
  body: { padding: spacing.lg, gap: spacing.sm },
  name: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  gap: { gap: 2 },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  strong: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink },
  body2: { fontSize: fontSize.sm, color: colors.ink },
  price: { fontSize: fontSize.md, fontWeight: "700", color: colors.ink },
});
