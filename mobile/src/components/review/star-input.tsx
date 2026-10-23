import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, MIN_TOUCH, spacing, type } from "~/theme";

type Props = { value: number; onChange: (stars: number) => void; error?: string | null };

// Vælg 1 til 5 stjerner. Hver stjerne er en trykflade på mindst 44 pt og læses op som "3 stjerner".
export function StarInput({ value, onChange, error }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Din bedømmelse</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={n === 1 ? "1 stjerne" : `${n} stjerner`}
            accessibilityState={{ selected: n === value }}
            onPress={() => onChange(n)}
            style={styles.star}
            hitSlop={4}
          >
            <Ionicons name={n <= value ? "star" : "star-outline"} size={32} color={n <= value ? colors.brand600 : colors.fieldBorder} />
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...type.caption, fontWeight: "600", color: colors.ink },
  row: { flexDirection: "row", gap: spacing.xs },
  star: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  error: { ...type.caption, color: colors.dangerInk },
});
