import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CLINIC_SORTS, CLINIC_SORT_LABEL } from "@/lib/constants/clinics";
import type { ServiceGroupDto } from "@/lib/types/services";
import { Button, Checkbox, CheckboxText, Chip, StatusMessage, TextField } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";
import { canSortBy, hasOrigin, isPostalCode, type DirectoryFilters } from "~/utils/clinic-filters";

type Props = {
  filters: DirectoryFilters;
  groups: ServiceGroupDto[] | null;
  onChange: (patch: Partial<DirectoryFilters>) => void;
  onReset: () => void;
  onPickServices: () => void;
  onUsePosition: () => void;
  locating: boolean;
  positionError: string | null;
};

// Filtrene i oversigten (architecture 6.6, 13.4): behandling, postnummer eller position, akut og sortering.
export function ClinicFilters({ filters, groups, onChange, onReset, onPickServices, onUsePosition, locating, positionError }: Props) {
  const [postalDraft, setPostalDraft] = useState(filters.postalCode);
  const names = new Map((groups ?? []).flatMap((g) => g.services.map((s) => [s.slug, s.name] as const)));
  const postalInvalid = postalDraft !== "" && !isPostalCode(postalDraft);

  function changePostal(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setPostalDraft(digits);
    if (digits === "" || isPostalCode(digits)) onChange({ postalCode: digits, position: null });
  }

  const serviceLabel =
    filters.serviceSlugs.length === 0
      ? "Vælg behandling"
      : filters.serviceSlugs.map((slug) => names.get(slug) ?? slug).join(", ");

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>Behandling</Text>
      <Button label={serviceLabel} variant="secondary" accessibilityLabel={`Behandling: ${serviceLabel}. Tryk for at ændre`} onPress={onPickServices} />

      <TextField
        label="Postnummer"
        value={postalDraft}
        onChangeText={changePostal}
        keyboardType="number-pad"
        maxLength={4}
        autoComplete="postal-code"
        error={postalInvalid ? "Angiv et gyldigt postnummer." : null}
      />
      <Button
        label={filters.position ? "Bruger din position" : "Brug min position"}
        variant="secondary"
        loading={locating}
        onPress={() => {
          setPostalDraft("");
          onUsePosition();
        }}
      />
      {positionError ? <StatusMessage message={positionError} tone="warning" /> : null}
      {filters.position ? <Text style={styles.muted}>Din position bruges kun til afstanden og gemmes ikke.</Text> : null}

      <Checkbox checked={filters.emergency} onChange={(emergency) => onChange({ emergency, ...(emergency ? { sort: "first_available" } : {}) })} accessibilityLabel="Kun klinikker med akuttid inden for 48 timer">
        <CheckboxText>Kun klinikker med akuttid (inden for 48 timer)</CheckboxText>
      </Checkbox>

      <Text style={styles.label}>Sortér efter</Text>
      <View style={styles.chips}>
        {CLINIC_SORTS.map((sort) => (
          <Chip
            key={sort}
            label={CLINIC_SORT_LABEL[sort]}
            selected={filters.sort === sort}
            disabled={!canSortBy(filters, sort)}
            onPress={() => onChange({ sort: filters.sort === sort ? null : sort })}
          />
        ))}
      </View>
      {!hasOrigin(filters) ? <Text style={styles.muted}>Angiv postnummer eller position for at se afstand.</Text> : null}
      <Button label="Nulstil filtre" variant="secondary" onPress={() => {
        setPostalDraft("");
        onReset();
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md, backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, padding: spacing.lg },
  label: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
