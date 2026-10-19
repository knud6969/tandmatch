import { Image, Linking, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FIRST_AVAILABLE_SEARCH_DAYS } from "@/lib/constants/bookings";
import type { ClinicProfileDto } from "@/lib/types/clinics";
import { getClinic, getClinicReviews } from "~/api/clinics";
import { getServiceGroups } from "~/api/services";
import { OpeningHours } from "~/components/clinic-directory/opening-hours";
import { PriceList } from "~/components/clinic-directory/price-list";
import { ProfileSection } from "~/components/clinic-directory/profile-section";
import { ReviewList } from "~/components/clinic-directory/review-list";
import { StarRating } from "~/components/clinic-directory/star-rating";
import { TrustpilotBlock } from "~/components/clinic-directory/trustpilot-block";
import { BackLink, Badge, Button, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize, radius, spacing } from "~/theme";
import { BASIC_CLINIC_LABEL, BASIC_CLINIC_PROFILE_TEXT, BASIC_CLINIC_PROFILE_TITLE, VERIFIED_CLINIC_LABEL } from "~/utils/clinic-texts";
import { formatKm, formatShortDateTime, phoneHref, safeWebHref, websiteLabel } from "~/utils/format";

function openWeb(url: string) {
  const href = safeWebHref(url);
  if (href) void WebBrowser.openBrowserAsync(href);
}

function Reviews({ clinicId }: { clinicId: string }) {
  const reviews = useLoad(() => getClinicReviews(clinicId), [clinicId]);
  return (
    <LoadState {...reviews} onRetry={reviews.reload}>
      {(data) => <ReviewList data={data} />}
    </LoadState>
  );
}

function Profile({ clinic }: { clinic: ClinicProfileDto }) {
  const catalog = useLoad(getServiceGroups);
  const full = clinic.tier === "full";
  const stats = clinic.reviewStats;
  const website = safeWebHref(clinic.website);
  return (
    <>
      <View style={styles.hero}>
        {full && clinic.logoUrl ? (
          <Image source={{ uri: clinic.logoUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel={`Logo for ${clinic.name}`} />
        ) : (
          <Text style={styles.glyph}>✚</Text>
        )}
      </View>
      <View style={styles.head}>
        <Badge label={full ? VERIFIED_CLINIC_LABEL : BASIC_CLINIC_LABEL} tone={full ? "info" : "warning"} />
        <Text accessibilityRole="header" style={styles.title}>
          {clinic.name}
        </Text>
        <Text style={styles.muted}>
          {clinic.address}, {clinic.postalCode} {clinic.city}
          {clinic.distanceKm !== null ? ` · ${formatKm(clinic.distanceKm)}` : ""}
        </Text>
        {full && stats && stats.reviewCount > 0 && stats.avgStars !== null ? (
          <View>
            <StarRating value={stats.avgStars} count={stats.reviewCount} />
            <Text style={styles.muted}>verificerede anmeldelser</Text>
          </View>
        ) : null}
        {full ? (
          <Text style={styles.body}>
            <Text style={styles.muted}>Første ledige tid (undersøgelse): </Text>
            {clinic.firstAvailableAt ? (
              <Text style={styles.strong}>{formatShortDateTime(clinic.firstAvailableAt)}</Text>
            ) : (
              <Text style={styles.muted}>ingen ledige tider de næste {FIRST_AVAILABLE_SEARCH_DAYS} dage</Text>
            )}
          </Text>
        ) : null}
        {clinic.phone ? <Button label={`Ring: ${clinic.phone}`} onPress={() => void Linking.openURL(phoneHref(clinic.phone ?? ""))} /> : null}
        {website ? <Button label={`Klinikkens website: ${websiteLabel(website)}`} variant="secondary" onPress={() => openWeb(website)} /> : null}
      </View>

      {!full ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{BASIC_CLINIC_PROFILE_TITLE}</Text>
          <Text style={styles.body}>{BASIC_CLINIC_PROFILE_TEXT}</Text>
        </View>
      ) : null}

      {full && clinic.description ? (
        <ProfileSection title="Om klinikken">
          <Text style={styles.body}>{clinic.description}</Text>
        </ProfileSection>
      ) : null}
      {full ? (
        <>
          <ProfileSection title="Prisliste">
            <PriceList prices={clinic.allPrices} groups={catalog.data} />
          </ProfileSection>
          <ProfileSection title="Anmeldelser på TandMatch">
            <Reviews clinicId={clinic.id} />
          </ProfileSection>
        </>
      ) : null}
      <ProfileSection title="Åbningstider">
        <OpeningHours hours={clinic.openingHours} />
      </ProfileSection>
      <ProfileSection title="Trustpilot (ekstern kilde)">
        <TrustpilotBlock trustpilot={clinic.trustpilot} onOpen={openWeb} />
      </ProfileSection>
    </>
  );
}

// Offentlig klinikprofil (architecture 6.1, 13.4). Fuldt niveau viser alt; basisniveau viser grunddata, åbningstider og
// Trustpilot og siger tydeligt, at klinikken ikke er på TandMatch endnu.
export function ClinicProfileScreen() {
  const router = useRouter();
  const { clinicId } = useLocalSearchParams<{ clinicId: string }>();
  const clinic = useLoad(() => getClinic(clinicId), [clinicId]);
  return (
    <Screen>
      <BackLink label="Alle klinikker" onPress={() => (router.canGoBack() ? router.back() : router.replace("/klinikker"))} />
      {clinic.error ? (
        <>
          <StatusMessage message={clinic.error} tone="danger" />
          <Button label="Prøv igen" variant="secondary" onPress={clinic.reload} />
        </>
      ) : (
        <LoadState {...clinic} onRetry={clinic.reload}>
          {(data) => <Profile clinic={data} />}
        </LoadState>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 160, borderRadius: radius.lg, backgroundColor: colors.brand50, alignItems: "center", justifyContent: "center" },
  logo: { width: "60%", height: "70%" },
  glyph: { fontSize: 56, color: colors.brand700 },
  head: { gap: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  strong: { fontWeight: "700", color: colors.ink },
  infoBox: { backgroundColor: colors.infoBg, borderColor: colors.infoLine, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  infoTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.brand800 },
});
