import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";

type Props = Omit<TextInputProps, "style"> & { label: string; error?: string | null };

export function TextField({ label, error, ...input }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, error ? styles.inputError : null]}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.ink },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.dangerLine },
  error: { fontSize: fontSize.sm, color: colors.dangerInk },
});
