import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { remainingLeadSlots } from "@/lib/leads/domain/leads";
import { getCase } from "~/api/cases";
import { listCaseLeads } from "~/api/leads";
import { listClinics } from "~/api/clinics";
import { getServiceGroups } from "~/api/services";
import { ClinicCard } from "~/components/clinic-directory/clinic-card";
import { ClinicFilters } from "~/components/clinic-directory/clinic-filters";
import { CriteriaBox } from "~/components/clinic-directory/criteria-box";
import { EmptyDirectory, SHOW_OTHERS_LABEL } from "~/components/clinic-directory/empty-directory";
import { OfferingNotice } from "~/components/clinic-directory/offering-notice";
import { EmergencyNotice } from "~/components/clinic-directory/emergency-notice";
import { SelectButton } from "~/components/leads/select-button";
import { ServicePicker } from "~/components/clinic-directory/service-picker";
import { Button, StatusMessage } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize, spacing } from "~/theme";
import {
  activeFilterCount,
  buildClinicsQuery,
  canWidenDistance,
  DEFAULT_FILTERS,
  filtersOnOffering,
  sameServices,
  serviceNames,
  showOtherClinics,
  toggleService,
  widenDistance,
  type DirectoryFilters,
} from "~/utils/clinic-filters";
import { clinicsWord, setLimits, useSelection } from "~/utils/lead-selection";
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

  // Fra sagsflowets "Se klinikker der kan hjælpe": filtrer på sagens bekræftede behandlinger og postnummer og lad patienten vælge klinikker (8.8a).
  const caseId = params.sag;
  const [appliedCase, setAppliedCase] = useState<string | null>(null);
  // Sagens egne behandlinger, uafhængigt af filteret: "Vælg" afgøres af dem og først, når sagen er indlæst.
  const [caseSlugs, setCaseSlugs] = useState<string[] | null>(null);
  useEffect(() => {
    if (!caseId || appliedCase === caseId) return;
    let cancelled = false;
    Promise.all([getCase(caseId), listCaseLeads(caseId).catch(() => [])])
      .then(([dto, leads]) => {
        if (cancelled) return;
        setAppliedCase(caseId);
        setCaseSlugs(dto.services.map((service) => service.slug));
        setLimits(
          caseId,
          remainingLeadSlots(dto.leadCount, dto.totalLeadCount),
          leads.filter((lead) => !lead.clinic.removed).map((lead) => lead.clinic.id),
        );
        setFilters((f) => ({
          ...f,
          serviceSlugs: dto.services.map((service) => service.slug),
          onlyOffering: true,
          postalCode: dto.postalCode ?? f.postalCode,
          position: dto.postalCode ? null : f.position,
        }));
      })
      .catch(() => undefined); // Uden sagen vises oversigten ufiltreret.
    return () => {
      cancelled = true;
    };
  }, [caseId, appliedCase]);

  // Valget af klinikker huskes pr. sag, så det overlever, at patienten åbner en profil og vender tilbage.
  const selection = useSelection(caseId);
  const query = buildClinicsQuery(filters);
  const clinics = useLoad(() => listClinics(query), [query]);
  const catalog = useLoad(getServiceGroups);

  const change = useCallback((patch: Partial<DirectoryFilters>) => setFilters((f) => ({ ...f, ...patch })), []);

  // Positionen rundes af (getRoundedPosition), så der ikke sendes en præcis adresse til serveren; den erstatter postnummeret.
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
  // Klinikkens pris i listen gælder filterets behandlinger; den gælder kun sagen, når filteret stadig er sagens.
  const priceMatchesCase = caseSlugs !== null && sameServices(filters.serviceSlugs, caseSlugs);
  const onlyOffering = filtersOnOffering(filters);
  const names = new Map((catalog.data ?? []).flatMap((g) => g.services.map((s) => [s.slug, s.name] as const)));

  // Header i selve listen, så filtre og overskrift ruller med i stedet for at æde pladsen på en lille skærm.
  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>
        Find en klinik
      </Text>
      {caseId ? (
        <Text style={styles.muted}>
          Vælg de klinikker, du vil kontakte med din beskrivelse. Kun verificerede klinikker kan kontaktes.
          {selection.slots > 0 ? ` Du kan vælge op til ${selection.slots}.` : " Du kan ikke kontakte flere klinikker lige nu."}
        </Text>
      ) : null}
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
      {hasServices ? <OfferingNotice names={serviceNames(filters.serviceSlugs, names)} onlyOffering={onlyOffering} caseMode={Boolean(caseId)} /> : null}
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
          <View style={styles.cardGroup}>
            <ClinicCard
              clinic={item}
              hasServices={hasServices}
              emergency={filters.emergency}
              onPress={() => router.push({ pathname: "/klinik/[clinicId]", params: caseId ? { clinicId: item.id, sag: caseId } : { clinicId: item.id } })}
            />
            {caseId ? (
              caseSlugs === null ? (
                <Button label="Vælg klinik" disabled accessibilityLabel={`Vælg ${item.name}. Henter din sag`} onPress={() => undefined} />
              ) : (
                <SelectButton
                  caseId={caseId}
                  clinic={priceMatchesCase ? item : { ...item, priceForSelection: null }}
                  hasServices={caseSlugs.length > 0}
                />
              )
            ) : null}
          </View>
        )}
        ListFooterComponent={
          onlyOffering && list && list.clinics.length > 0 ? (
            <View style={styles.footer}>
              <Button label={SHOW_OTHERS_LABEL} variant="secondary" onPress={() => setFilters(showOtherClinics)} />
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          clinics.loading && !list ? (
            <View style={styles.center} accessibilityLabel="Henter">
              {/* Kun ved første hentning; senere opdateringer viser "opdaterer" i tælleren, så listen ikke blinker. */}
              <ActivityIndicator color={colors.brand600} size="large" />
            </View>
          ) : list ? (
            <EmptyDirectory
              onlyOffering={onlyOffering}
              emergency={filters.emergency}
              canWiden={canWidenDistance(filters)}
              onShowOthers={() => setFilters(showOtherClinics)}
              onWiden={() => setFilters(widenDistance)}
            />
          ) : undefined
        }
      />
      {/* Fast bund-bjælke, så fortsæt-knappen altid er inden for tommelfingerens rækkevidde. */}
      {caseId && selection.ids.length > 0 ? (
        <View style={styles.bar}>
          <Button
            label={`Fortsæt med ${clinicsWord(selection.ids.length)}`}
            onPress={() => router.push({ pathname: "/sag/[caseId]/send", params: { caseId, klinikker: selection.ids.join(",") } })}
          />
        </View>
      ) : null}
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
  cardGroup: { gap: spacing.sm },
  bar: { padding: spacing.lg, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: colors.line },
  count: { fontSize: fontSize.sm, color: colors.inkMuted },
  center: { padding: spacing.xxl, alignItems: "center" },
  footer: { paddingTop: spacing.xl },
  muted: { fontSize: fontSize.md, color: colors.inkMuted },
});
