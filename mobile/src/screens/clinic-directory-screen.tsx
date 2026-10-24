import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { remainingLeadSlots } from "@/lib/leads/domain/leads";
import { getCase } from "~/api/cases";
import { listCaseLeads } from "~/api/leads";
import { listClinics } from "~/api/clinics";
import { getServiceGroups } from "~/api/services";
import { ClinicCard } from "~/components/clinic-directory/clinic-card";
import { ClinicMap } from "~/components/clinic-directory/clinic-map";
import { ClinicMapCard } from "~/components/clinic-directory/clinic-map-card";
import { ClinicFilters } from "~/components/clinic-directory/clinic-filters";
import { CriteriaBox } from "~/components/clinic-directory/criteria-box";
import { EmptyDirectory, SHOW_OTHERS_LABEL } from "~/components/clinic-directory/empty-directory";
import { OfferingNotice } from "~/components/clinic-directory/offering-notice";
import { EmergencyNotice } from "~/components/clinic-directory/emergency-notice";
import { SelectButton } from "~/components/leads/select-button";
import { ServicePicker } from "~/components/clinic-directory/service-picker";
import { Button, StatusMessage } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize, MIN_TOUCH, radius, spacing, type } from "~/theme";
import {
  activeFilterCount,
  buildClinicsQuery,
  caseFilterKey,
  canWidenDistance,
  DEFAULT_FILTERS,
  filtersForCase,
  filtersOnOffering,
  sameServices,
  shouldApplyCase,
  serviceNames,
  showOtherClinics,
  toggleService,
  widenDistance,
  type DirectoryFilters,
} from "~/utils/clinic-filters";
import { clinicsWord, setLimits, useSelection } from "~/utils/lead-selection";
import { clinicsWithLocation } from "~/utils/map-region";
import { getRoundedPosition, PositionError } from "~/utils/position";

// Klinikoversigten som liste eller kort med filtre (architecture 6.6, 13.4). Rækkefølgen og kriterierne er serverens.
export function ClinicDirectoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ akut?: string; sag?: string }>();
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  // Liste eller kort: samme data, filtre og rækkefølge; ingen ekstra forespørgsel.
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { height: windowHeight } = useWindowDimensions();

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
  // Nøglen for den sag (id, behandlinger, postnummer), filtrene sidst blev sat fra.
  const appliedKey = useRef<string | null>(null);
  // Sagens egne behandlinger, uafhængigt af filteret: "Vælg" afgøres af dem og først, når sagen er indlæst.
  const [caseSlugs, setCaseSlugs] = useState<string[] | null>(null);
  // Sagen hentes igen, hver gang oversigten får fokus med en sag (fanen forbliver monteret, og samme parametre udløser ikke en ny effekt),
  // så ændrede behandlinger eller postnummer på samme sag slår igennem.
  const loadCase = useCallback(() => {
    if (!caseId) return () => undefined;
    let cancelled = false;
    Promise.all([getCase(caseId), listCaseLeads(caseId).catch(() => [])])
      .then(([dto, leads]) => {
        if (cancelled) return;
        const key = caseFilterKey(caseId, dto);
        setCaseSlugs(dto.services.map((service) => service.slug));
        setLimits(
          caseId,
          remainingLeadSlots(dto.leadCount, dto.totalLeadCount),
          leads.filter((lead) => !lead.clinic.removed).map((lead) => lead.clinic.id),
        );
        // Kun ny eller ændret sag nulstiller filtrene til sagens; ellers bevares patientens egne ændringer.
        if (shouldApplyCase(appliedKey.current, key)) setFilters(filtersForCase(dto));
        appliedKey.current = key;
      })
      .catch(() => undefined); // Uden sagen vises oversigten ufiltreret.
    return () => {
      cancelled = true;
    };
  }, [caseId]);
  useFocusEffect(loadCase);

  // Forsvinder sagen (patienten åbner oversigten uden), nulstilles sagens filtre og sags-tilstanden, så de ikke hænger ved.
  useEffect(() => {
    if (!caseId && appliedKey.current !== null) {
      appliedKey.current = null;
      setCaseSlugs(null);
      setFilters(DEFAULT_FILTERS);
    }
  }, [caseId]);

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

  // "Vælg klinik" til en sag, med samme regler i liste og kort.
  const selectAction = (item: ClinicListItemDto) =>
    caseId ? (
      caseSlugs === null ? (
        <Button label="Vælg klinik" disabled accessibilityLabel={`Vælg ${item.name}. Henter din sag`} onPress={() => undefined} />
      ) : (
        <SelectButton caseId={caseId} clinic={priceMatchesCase ? item : { ...item, priceForSelection: null }} hasServices={caseSlugs.length > 0} />
      )
    ) : null;
  const openProfile = (item: ClinicListItemDto) =>
    router.push({ pathname: "/klinik/[clinicId]", params: caseId ? { clinicId: item.id, sag: caseId } : { clinicId: item.id } });
  // Valgt markør, der ikke længere er i svaret (nye filtre), vises ikke.
  const selected = list?.clinics.find((c) => c.id === selectedId) ?? null;
  const mapped = list ? clinicsWithLocation(list.clinics).length : 0;

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
      <View style={styles.toggle} accessibilityRole="tablist">
        <ViewTab label="Liste" active={view === "list"} onPress={() => setView("list")} />
        <ViewTab label="Kort" active={view === "map"} onPress={() => setView("map")} />
      </View>
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
      {view === "map" ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {header}
          {list ? (
            <View style={styles.mapGroup}>
              <ClinicMap
                clinics={list.clinics}
                origin={filters.position}
                radiusKm={filters.maxDistanceKm}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                height={Math.max(320, Math.round(windowHeight * 0.5))}
              />
              {mapped < list.clinics.length ? (
                <Text style={styles.muted}>
                  {list.clinics.length - mapped === 1 ? "1 klinik" : `${list.clinics.length - mapped} klinikker`} har ingen placering og vises kun i listen.
                </Text>
              ) : null}
              {selected ? (
                <ClinicMapCard
                  clinic={selected}
                  hasServices={hasServices}
                  onOpenProfile={() => openProfile(selected)}
                  onClose={() => setSelectedId(null)}
                  action={selectAction(selected)}
                />
              ) : (
                <Text style={styles.muted}>Tryk på en klinik på kortet for at se pris og afstand. Skift til listen for at se alle detaljer.</Text>
              )}
            </View>
          ) : clinics.loading ? (
            <View style={styles.center} accessibilityLabel="Henter">
              <ActivityIndicator color={colors.brand600} size="large" />
            </View>
          ) : null}
        </ScrollView>
      ) : (
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
              onPress={() => openProfile(item)}
            />
            {selectAction(item)}
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
              filters={filters}
              serviceNames={names}
              canWiden={canWidenDistance(filters)}
              onShowOthers={() => setFilters(showOtherClinics)}
              onWiden={() => setFilters(widenDistance)}
            />
          ) : undefined
        }
      />
      )}
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

// Skifter mellem liste og kort (fane-agtigt, mindst 44 pt højt).
function ViewTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label === "Kort" ? "Vis klinikkerne på kort" : "Vis klinikkerne som liste"}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[type.label, active && { color: colors.onBrand }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand200, backgroundColor: colors.brand50, padding: 3 },
  tab: { flex: 1, minHeight: MIN_TOUCH - 6, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.brand600 },
  mapGroup: { gap: spacing.md },
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
