import { StyleSheet, Text } from "react-native";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { Button } from "~/components/ui";
import { colors, fontSize } from "~/theme";
import { lacksPriceForSelection, NO_PRICE_FOR_SELECTION_TEXT, toggleClinic, useSelection } from "~/utils/lead-selection";

// Faste tekster, så oversigt og profil siger det samme.
export const BASIC_NOT_CONTACTABLE_TEXT = "Kan ikke kontaktes via TandMatch endnu";
export const ALREADY_CONTACTED_TEXT = "Du har allerede kontaktet denne klinik med sagen";
export const SELECTION_FULL_TEXT = "Du har valgt det højeste antal klinikker. Fravælg en for at vælge en anden.";

// "Vælg klinik" til en sag: kun verificerede klinikker kan kontaktes, og højst så mange, som der er ledige pladser til.
// `hasServices`: sagen har bekræftede behandlinger, så en klinik uden pris på dem alle ikke kan vælges (13.4a).
export function SelectButton({
  caseId,
  clinic,
  hasServices = false,
}: {
  caseId: string;
  clinic: Pick<ClinicListItemDto, "id" | "name" | "canReceiveLeads" | "priceForSelection">;
  hasServices?: boolean;
}) {
  const selection = useSelection(caseId);
  const chosen = selection.ids.includes(clinic.id);
  if (!clinic.canReceiveLeads) return <Text style={styles.muted}>{BASIC_NOT_CONTACTABLE_TEXT}</Text>;
  if (selection.contacted.includes(clinic.id)) return <Text style={styles.muted}>{ALREADY_CONTACTED_TEXT}</Text>;
  if (lacksPriceForSelection(clinic, hasServices) && !chosen) {
    return (
      <>
        <Button label="Vælg klinik" disabled accessibilityLabel={`Vælg ${clinic.name}. ${NO_PRICE_FOR_SELECTION_TEXT}`} onPress={() => undefined} />
        <Text style={styles.muted}>{NO_PRICE_FOR_SELECTION_TEXT}</Text>
      </>
    );
  }
  const full = !chosen && selection.ids.length >= selection.slots;
  return (
    <>
      <Button
        label={chosen ? "Fravælg klinik" : "Vælg klinik"}
        variant={chosen ? "secondary" : "primary"}
        disabled={full}
        accessibilityLabel={`${chosen ? "Fravælg" : "Vælg"} ${clinic.name}`}
        onPress={() => toggleClinic(caseId, clinic.id)}
      />
      {full ? <Text style={styles.muted}>{SELECTION_FULL_TEXT}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({ muted: { fontSize: fontSize.sm, color: colors.inkMuted } });
