import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { patchPatientSchema } from "@/lib/schemas/patients";
import type { PatientMeDto } from "@/lib/types/patients";
import { Button, StatusMessage, TextField } from "~/components/ui";
import { fieldErrorsFrom, type FieldErrors } from "~/utils/field-errors";
import { spacing } from "~/theme";

type Values = { firstName: string; postalCode: string; phone: string };
type Props = {
  profile: PatientMeDto;
  onSave: (patch: { firstName?: string; postalCode?: string; phone?: string | null }) => void;
  pending: boolean;
  error: string | null;
  saved: boolean;
};

// Patientens profil (fornavn, postnummer, telefon). Tom telefon rydder nummeret (architecture 6.2).
export function ProfileForm({ profile, onSave, pending, error, saved }: Props) {
  const [values, setValues] = useState<Values>({
    firstName: profile.firstName ?? "",
    postalCode: profile.postalCode ?? "",
    phone: profile.phone ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors<keyof Values>>({});
  const set = (key: keyof Values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  function submit() {
    const patch: Record<string, string | null> = {};
    if (values.firstName.trim() !== (profile.firstName ?? "")) patch.firstName = values.firstName;
    if (values.postalCode.trim() !== (profile.postalCode ?? "") && values.postalCode.trim() !== "") patch.postalCode = values.postalCode;
    if (values.phone.trim() !== (profile.phone ?? "")) patch.phone = values.phone.trim() === "" ? null : values.phone;
    const parsed = patchPatientSchema.safeParse(patch);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    onSave(parsed.data);
  }

  return (
    <View style={styles.form}>
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      {saved && !error ? <StatusMessage message="Dine oplysninger er gemt." tone="success" /> : null}
      <TextField label="Fornavn" value={values.firstName} onChangeText={set("firstName")} error={errors.firstName} autoComplete="given-name" />
      <TextField
        label="Postnummer"
        value={values.postalCode}
        onChangeText={(v) => set("postalCode")(v.replace(/\D/g, "").slice(0, 4))}
        error={errors.postalCode}
        keyboardType="number-pad"
        autoComplete="postal-code"
      />
      <TextField label="Telefon (valgfri)" value={values.phone} onChangeText={set("phone")} error={errors.phone} keyboardType="phone-pad" autoComplete="tel" />
      <Button label="Gem" variant="secondary" loading={pending} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: spacing.md } });
