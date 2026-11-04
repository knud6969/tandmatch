import { StyleSheet, Text, View } from "react-native";
import { PUSH_PROMPT_DISMISS, PUSH_PROMPT_ENABLE, PUSH_PROMPT_TEXT, PUSH_PROMPT_TITLE } from "@/lib/common/constants/notifications";
import { Button, Card } from "~/components/ui";
import { colors, fontSize, spacing } from "~/theme";

// Kortet efter den første henvendelse (mobile 13.10). Vises kun, når skærmen har afgjort det (shouldShowPushPrompt).
export function PushPromptCard({ onEnable, onDismiss }: { onEnable: () => void; onDismiss: () => void }) {
  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        {PUSH_PROMPT_TITLE}
      </Text>
      <Text style={styles.text}>{PUSH_PROMPT_TEXT}</Text>
      <View style={styles.actions}>
        <Button label={PUSH_PROMPT_ENABLE} onPress={onEnable} />
        <Button label={PUSH_PROMPT_DISMISS} variant="text" onPress={onDismiss} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  text: { fontSize: fontSize.md, color: colors.ink },
  actions: { gap: spacing.sm },
});
