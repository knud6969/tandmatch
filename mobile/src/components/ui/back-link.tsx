import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fontSize, MIN_TOUCH } from "~/theme";

export function BackLink({ label = "Tilbage", onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={styles.link} hitSlop={8}>
      <Text style={styles.text}>← {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: MIN_TOUCH, justifyContent: "center", alignSelf: "flex-start" },
  text: { fontSize: fontSize.md, fontWeight: "600", color: colors.brand700 },
});
