import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { CASE_FLOW_TEXTS } from "@/lib/constants/case-flow";
import { postalCodeSchema } from "@/lib/schemas/clinics";
import type { CaseDto } from "@/lib/types/cases";
import { Button, StatusMessage, TextField } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import type { CaseActions } from "~/hooks/use-case-actions";
import { colors, fontSize } from "~/theme";
import { FlowCard, FoldedCard } from "./flow-card";

type Props = {
  caseDto: CaseDto;
  answered: boolean;
  // Patienter med konto får postnummeret fra profilen som forslag; anonyme har ingen profil.
  hasAccount: boolean;
  actions: CaseActions;
  onSaved: () => void;
};

// Første gyldige fejltekst fra postalCodeSchema (samme skema som serveren).
export function postalCodeError(value: string): string | null {
  const parsed = postalCodeSchema.safeParse(value);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Skriv et gyldigt postnummer.");
}

// "Hvor vil du helst gå til tandlæge?": postnummeret bruges til afstand og deles ikke, før patienten sender (architecture 7.9).
export function PostalCodeCard({ caseDto, answered, hasAccount, actions, onSaved }: Props) {
  const [value, setValue] = useState(caseDto.postalCode ?? "");
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!hasAccount || caseDto.postalCode) return;
    let cancelled = false;
    actions.profilePostalCode().then((postalCode) => {
      if (!cancelled && postalCode) setValue((current) => (current === "" ? postalCode : current));
    });
    return () => {
      cancelled = true;
    };
  }, [hasAccount, caseDto.postalCode, actions]);

  const save = useAction(async () => {
    await actions.setPostalCode(value);
    setEditing(false);
    onSaved();
  });

  if (answered && !editing && caseDto.postalCode) {
    return <FoldedCard testID="kort-postnummer-besvaret" label="Postnummer" value={caseDto.postalCode} onEdit={() => setEditing(true)} />;
  }

  const submit = () => {
    setTouched(true);
    const error = postalCodeError(value);
    setFieldError(error);
    if (!error) void save.run();
  };

  return (
    <FlowCard title={CASE_FLOW_TEXTS.postalCodeQuestion} testID="kort-postnummer">
      <TextField
        label="Postnummer"
        testID="postnummer-input"
        value={value}
        onChangeText={(text) => {
          setValue(text.replace(/\D/g, ""));
          if (touched) setFieldError(null);
        }}
        error={fieldError}
        keyboardType="number-pad"
        maxLength={4}
        autoComplete="postal-code"
        textContentType="postalCode"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Text style={styles.hint}>Bruges til at vise afstand til klinikkerne. Det deles ikke, før du sender.</Text>
      {save.error ? <StatusMessage message={save.error} tone="danger" /> : null}
      <Button label="Gem postnummer" loading={save.pending} onPress={submit} />
    </FlowCard>
  );
}

const styles = StyleSheet.create({ hint: { fontSize: fontSize.sm, color: colors.inkMuted } });
