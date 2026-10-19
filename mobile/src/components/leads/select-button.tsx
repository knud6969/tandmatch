import { StyleSheet, Text } from "react-native";
import type { ClinicListItemDto } from "@/lib/types/clinics";
import { Button } from "~/components/ui";
import { colors, fontSize } from "~/theme";
import { toggleClinic, useSelection } from "~/utils/lead-selection";

export const BASIC_NOT_CONTACTABLE_TEXT = "Kan ikke kontaktes via TandMatch endnu";
export const ALREADY_CONTACTED_TEXT = "Du har allerede kontaktet denne klinik med sagen";
export const SELECTION_FULL_TEXT = "Du har valgt det højeste antal klinikker. Fravælg en for at vælge en anden.";

// "Vælg klinik" til en sag: kun verificerede klinikker kan kontaktes, og højst så mange, som der er ledige pladser til.
export function SelectButton({ caseId, clinic }: { caseId: string; clinic: Pick<ClinicListItemDto, "id" | "name" | "canReceiveLeads"> }) {
  const selection = useSelection(caseId);
  const chosen = selection.ids.includes(clinic.id);
  if (!clinic.canReceiveLeads) return <Text style={styles.muted}>{BASIC_NOT_CONTACTABLE_TEXT}</Text>;
  if (selection.contacted.includes(clinic.id)) return <Text style={styles.muted}>{ALREADY_CONTACTED_TEXT}</Text>;
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
