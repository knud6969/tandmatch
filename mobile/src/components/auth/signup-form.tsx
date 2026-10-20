import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { convertSchema, signupSchema } from "@/lib/schemas/auth";
import { Button, StatusMessage, TextField } from "~/components/ui";
import { fieldErrorsFrom, type FieldErrors } from "~/utils/field-errors";
import { spacing } from "~/theme";

export type SignupValues = { email: string; password: string; firstName: string };
type Field = keyof SignupValues;

type Props = {
  onSubmit: (values: SignupValues) => void;
  pending: boolean;
  error: string | null;
  submitLabel?: string;
};

// Opret patientkonto: samme skemaer som serveren (signupSchema for patient; convertSchema har de samme felter).
export function SignupForm({ onSubmit, pending, error, submitLabel = "Opret konto" }: Props) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<Field>>({});

  function submit() {
    const parsed = signupSchema.safeParse({ role: "patient", email, password, firstName });
    if (!parsed.success || parsed.data.role !== "patient") {
      setErrors(parsed.success ? {} : fieldErrorsFrom(parsed.error));
      return;
    }
    // Konvertering af en anonym session bruger samme felter; her sikres, at værdierne også opfylder dét skema.
    const values = convertSchema.parse({ email: parsed.data.email, password: parsed.data.password, firstName: parsed.data.firstName });
    setErrors({});
    onSubmit(values);
  }

  return (
    <View style={styles.form}>
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      <TextField
        label="Fornavn"
        value={firstName}
        onChangeText={setFirstName}
        error={errors.firstName}
        autoComplete="given-name"
        textContentType="givenName"
      />
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
      />
      <TextField
        label="Adgangskode (mindst 8 tegn)"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={submit}
      />
      <Button label={submitLabel} loading={pending} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: spacing.md } });
