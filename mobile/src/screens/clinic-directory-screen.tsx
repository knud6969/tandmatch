import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { OUT_OF_HOURS_HELP_TEXT } from "@/lib/constants/emergency";
import { getCase } from "~/api/cases";
import { listClinics } from "~/api/clinics";
import { getServiceGroups } from "~/api/services";
import { ClinicCard } from "~/components/clinic-directory/clinic-card";
import { ClinicFilters } from "~/components/clinic-directory/clinic-filters";
import { CriteriaBox } from "~/components/clinic-directory/criteria-box";
import { EmergencyNotice } from "~/components/clinic-directory/emergency-notice";
import { ServicePicker } from "~/components/clinic-directory/service-picker";
import { Button, StatusMessage } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize, spacing } from "~/theme";
import { activeFilterCount, buildClinicsQuery, DEFAULT_FILTERS, toggleService, type DirectoryFilters } from "~/utils/clinic-filters";
import { getRoundedPosition, PositionError } from "~/utils/position";

// Klinikoversigten som liste med filtre (architecture 6.6, 13.4). Rækkefølgen og kriterierne er serverens.
export function ClinicDirectoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ akut?: string; sag?: string }>();
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);

  // "Jeg har ondt" på forsiden åbner oversigten med akutfilteret slået til.
  useEffect(() => {
    if (params.akut === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilters((f) => ({ ...f, emergency: true, sort: "first_available" }));
      router.setParams({ akut: undefined });
    }
  }, [params.akut, router]);

  // Fra sagsflowets "Se klinikker der kan hjælpe": filtrer på sagens bekræftede behandlinger og postnummer (vælg og send kommer i 8.8a).
  const caseId = params.sag;
  const [appliedCase, setAppliedCase] = useState<string | null>(null);
  useEffect(() => {
    if (!caseId || appliedCase === caseId) return;
    let cancelled = false;
    getCase(caseId)
      .then((dto) => {
        if (cancelled) return;
        setAppliedCase(caseId);
        setFilters((f) => ({
          ...f,
          serviceSlugs: dto.services.map((service) => service.slug),
          postalCode: dto.postalCode ?? f.postalCode,
          position: dto.postalCode ? null : f.position,
        }));
      })
      .catch(() => undefined); // Uden sagen vises oversigten ufiltreret.
    return () => {
      cancelled = true;
    };
  }, [caseId, appliedCase]);

  const query = buildClinicsQuery(filters);
  const clinics = useLoad(() => listClinics(query), [query]);
  const catalog = useLoad(getServiceGroups);

  const change = useCallback((patch: Partial<DirectoryFilters>) => setFilters((f) => ({ ...f, ...patch })), []);

  async function findPosition() {
    setLocating(true);
    setPositionError(null);
    try {
      const position = await getRoundedPosition();
      change({ position, postalCode: "" });
    } catch (e) {
      setPositionError(e instanceof PositionError ? e.message : "Vi kunne ikke få din position.");
    } finally {
      setLocating(false);
    }
  }

  const count = activeFilterCount(filters);
  const list = clinics.data;
  const hasServices = filters.serviceSlugs.length > 0;

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>
        Find en klinik
      </Text>
      <Button
        label={filtersOpen ? "Skjul filtre" : count > 0 ? `Filtre og sortering (${count})` : "Filtre og sortering"}
        variant="secondary"
        onPress={() => setFiltersOpen((open) => !open)}
      />
      {filtersOpen ? (
        <ClinicFilters
          filters={filters}
          groups={catalog.data}
          onChange={change}
          onReset={() => {
            setFilters(DEFAULT_FILTERS);
            setPositionError(null);
          }}
          onPickServices={() => setPickerOpen(true)}
          onUsePosition={() => void findPosition()}
          locating={locating}
          positionError={positionError}
        />
      ) : null}
      {filters.emergency ? <EmergencyNotice /> : null}
      {clinics.error ? (
        <>
          <StatusMessage message={clinics.error} tone="danger" />
          <Button label="Prøv igen" variant="secondary" onPress={clinics.reload} />
        </>
      ) : null}
      {list ? <CriteriaBox criteria={list.criteria} /> : null}
      {list ? (
        <Text style={styles.count} accessibilityLiveRegion="polite">
          {list.clinics.length === 1 ? "1 klinik" : `${list.clinics.length} klinikker`}
          {clinics.loading ? " · opdaterer …" : ""}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <FlatList
        data={list?.clinics ?? []}
        keyExtractor={(clinic) => clinic.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
        renderItem={({ item }) => (
          <ClinicCard
            clinic={item}
            hasServices={hasServices}
            emergency={filters.emergency}
            onPress={() => router.push({ pathname: "/klinik/[clinicId]", params: { clinicId: item.id } })}
          />
        )}
        ListEmptyComponent={
          clinics.loading && !list ? (
            <View style={styles.center} accessibilityLabel="Henter">
              <ActivityIndicator color={colors.brand600} size="large" />
            </View>
          ) : list ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ingen klinikker matcher dine filtre</Text>
              <Text style={styles.muted}>Prøv at ændre eller nulstille filtrene.</Text>
              {filters.emergency ? <Text style={styles.muted}>{OUT_OF_HOURS_HELP_TEXT}</Text> : null}
            </View>
          ) : undefined
        }
      />
      <ServicePicker
        visible={pickerOpen}
        groups={catalog.data ?? []}
        selected={filters.serviceSlugs}
        onToggle={(slug) => setFilters((f) => toggleService(f, slug))}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  count: { fontSize: fontSize.sm, color: colors.inkMuted },
  center: { padding: spacing.xxl, alignItems: "center" },
  empty: { gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  muted: { fontSize: fontSize.md, color: colors.inkMuted },
});
