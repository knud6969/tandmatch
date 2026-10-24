import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CASE_FLOW_TEXTS } from "@/lib/cases/constants/case-flow";
import { MAX_CONFIRMED_SERVICES_PER_CASE } from "@/lib/common/constants/limits";
import { EXAMINATION_SERVICE_SLUG } from "@/lib/clinics/constants/services";
import type { CaseDto } from "@/lib/cases/types/cases";
import type { ServiceDto, ServiceGroupDto } from "@/lib/clinics/types/services";
import { Button, Chip, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import type { CaseActions } from "~/hooks/use-case-actions";
import { initialServiceSelection, toggleSelection } from "~/utils/case-cards";
import { colors, fontSize, spacing } from "~/theme";
import { FlowCard, FoldedCard } from "./flow-card";
import { ServicePickerSheet } from "./service-picker-sheet";

type Props = {
  caseDto: CaseDto;
  answered: boolean;
  catalog: { groups: ServiceGroupDto[] | null; loading: boolean; error: string | null; reload: () => void };
  actions: CaseActions;
  onSaved: () => void;
};

// "Passer disse behandlinger?": AI'ens forslag er valgt fra start, men patienten bekræfter selv (architecture 7.9).
export function ServicesCard({ caseDto, answered, catalog, actions, onSaved }: Props) {
  // Forslagene sendes med ved bekræftelse, så serveren kan se, hvad patienten har ændret i forhold til AI'ens udkast.
  const suggestedIds = useMemo(() => caseDto.suggestedServices.map((s) => s.id), [caseDto.suggestedServices]);
  const [selected, setSelected] = useState<string[]>(() =>
    initialServiceSelection(
      caseDto.services.map((s) => s.id),
      suggestedIds,
    ),
  );
  const [picked, setPicked] = useState<ServiceDto[]>([]);
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Chips: forslagene, de allerede bekræftede og dem, patienten selv har valgt i kataloget.
  const options = useMemo(() => {
    const byId = new Map<string, ServiceDto>();
    for (const service of [...caseDto.suggestedServices, ...caseDto.services, ...picked]) byId.set(service.id, service);
    return [...byId.values()];
  }, [caseDto.suggestedServices, caseDto.services, picked]);

  // "Jeg er i tvivl" vælger undersøgelsen fra kataloget, så patienten altid kan komme videre uden at kende behandlingen.
  const examination = catalog.groups?.flatMap((g) => g.services).find((s) => s.slug === EXAMINATION_SERVICE_SLUG) ?? null;
  const save = useAction(async () => {
    await actions.confirmServices(selected, suggestedIds);
    setEditing(false);
    onSaved();
  });

  if (answered && !editing) {
    return (
      <FoldedCard
        testID="kort-behandlinger-besvaret"
        label="Dine behandlinger"
        value={caseDto.services.map((s) => s.name).join(", ")}
        onEdit={() => setEditing(true)}
      />
    );
  }

  const pickFromCatalog = (service: ServiceDto) => {
    setPicked((current) => (current.some((s) => s.id === service.id) ? current : [...current, service]));
    setSelected((current) => toggleSelection(current, service.id));
  };
  const notSure = () => {
    if (!examination) return;
    setPicked((current) => (current.some((s) => s.id === examination.id) ? current : [...current, examination]));
    setSelected([examination.id]);
  };
  const noSuggestions = options.length === 0;

  return (
    <FlowCard title={CASE_FLOW_TEXTS.servicesQuestion} testID="kort-behandlinger">
      <Text style={styles.hint}>
        {noSuggestions
          ? `Vælg op til ${MAX_CONFIRMED_SERVICES_PER_CASE}, eller tryk "${CASE_FLOW_TEXTS.servicesNotSure}".`
          : "Forslag ud fra din beskrivelse. Klinikken laver den endelige vurdering."}
      </Text>
      {options.length > 0 ? (
        <View style={styles.chips}>
          {options.map((service) => (
            <Chip
              key={service.id}
              label={service.name}
              selected={selected.includes(service.id)}
              onPress={() => setSelected((current) => toggleSelection(current, service.id))}
            />
          ))}
        </View>
      ) : null}
      {save.error ? <StatusMessage message={save.error} tone="danger" /> : null}
      <Button label={CASE_FLOW_TEXTS.servicesConfirm} disabled={selected.length === 0} loading={save.pending} onPress={() => void save.run()} />
      {/* Sekundære veje som stille tekstknapper, så der kun er ét tydeligt valg: Bekræft. */}
      <View style={styles.links}>
        <Button label={CASE_FLOW_TEXTS.servicesPickMyself} variant="text" onPress={() => setSheetOpen(true)} />
        {examination ? <Button label={CASE_FLOW_TEXTS.servicesNotSure} variant="text" onPress={notSure} /> : null}
      </View>
      <ServicePickerSheet
        visible={sheetOpen}
        groups={catalog.groups}
        loading={catalog.loading}
        error={catalog.error}
        onRetry={catalog.reload}
        selected={selected}
        onToggle={pickFromCatalog}
        onClose={() => setSheetOpen(false)}
      />
    </FlowCard>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: fontSize.sm, lineHeight: 20, color: colors.inkMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: spacing.lg },
});
