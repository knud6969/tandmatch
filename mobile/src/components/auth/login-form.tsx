import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { loginSchema } from "@/lib/identity/schemas/auth";
import { Button, StatusMessage, TextField } from "~/components/ui";
import { fieldErrorsFrom, type FieldErrors } from "~/utils/field-errors";
import { spacing } from "~/theme";

type Props = {
  onSubmit: (values: { email: string; password: string }) => void;
  pending: boolean;
  error: string | null;
  notice?: string | null;
};

// Loginformular. Valideres med samme skema som serveren, så fejl vises ved feltet før kaldet. autoComplete/textContentType lader adgangskodemanageren udfylde.
export function LoginForm({ onSubmit, pending, error, notice }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});

  function submit() {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  return (
    <View style={styles.form}>
      {notice ? <StatusMessage message={notice} tone="warning" /> : null}
      {error ? <StatusMessage message={error} tone="danger" /> : null}
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
        label="Adgangskode"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <Button label="Log ind" loading={pending} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: spacing.md } });
