import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { PATIENT_CONTACT_HELP, PATIENT_CONTACT_TITLE } from "@/lib/common/constants/notifications";
import type { NotificationContactDto } from "@/lib/identity/types/notification-contact";
import { Button, Card, StatusMessage, TextField } from "~/components/ui";
import { colors, fontSize } from "~/theme";
import type { FieldErrors } from "~/utils/field-errors";
import { parseContactForm, type ContactForm } from "~/utils/notification-inbox";

type Props = {
  initial: NotificationContactDto;
  // Gemmer og returnerer true, hvis det lykkedes.
  onSave: (value: NotificationContactDto) => Promise<boolean>;
  pending: boolean;
  error: string | null;
};

// Konto → "E-mail og SMS om dine tider" (mobile 13.10, identity 10.20). Tomme felter rydder valget.
export function NotificationContactForm({ initial, onSave, pending, error }: Props) {
  const [values, setValues] = useState<ContactForm>({ email: initial.email ?? "", phone: initial.phone ?? "" });
  const [errors, setErrors] = useState<FieldErrors<keyof ContactForm>>({});
  const [saved, setSaved] = useState(false);

  async function submit() {
    setSaved(false);
    const parsed = parseContactForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaved(await onSave(parsed.data));
  }

  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        {PATIENT_CONTACT_TITLE}
      </Text>
      <Text style={styles.text}>{PATIENT_CONTACT_HELP}</Text>
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      {saved && !error ? <StatusMessage message="Dine valg er gemt." tone="success" /> : null}
      <TextField
        label="E-mail (valgfri, ellers bruges din login-adresse)"
        value={values.email}
        onChangeText={(email) => setValues((v) => ({ ...v, email }))}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField
        label="Telefon til SMS (valgfri)"
        value={values.phone}
        onChangeText={(phone) => setValues((v) => ({ ...v, phone }))}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Button label="Gem" variant="secondary" loading={pending} onPress={() => void submit()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  text: { fontSize: fontSize.sm, color: colors.inkMuted },
});
