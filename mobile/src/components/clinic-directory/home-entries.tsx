import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Button } from "~/components/ui";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";

type Props = {
  // Chatten (8.6) er ikke bygget endnu: uden `onDescribe` vises indgangen som "Kommer snart".
  onDescribe?: () => void;
  onFindClinic: () => void;
  onEmergency: () => void;
};

// Forsidens tre indgange (architecture 13.4): "Beskriv dit problem", "Find en klinik" og "Jeg har ondt".
export function HomeEntries({ onDescribe, onFindClinic, onEmergency }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Beskriv dit problem eller upload et billede"
        accessibilityHint={onDescribe ? undefined : "Kommer snart"}
        accessibilityState={{ disabled: !onDescribe }}
        disabled={!onDescribe}
        onPress={onDescribe}
        style={({ pressed }) => [styles.chat, !onDescribe && styles.chatOff, pressed && { opacity: 0.9 }]}
      >
        <Text style={styles.chatTitle}>Beskriv dit problem eller upload et billede</Text>
        <Text style={styles.chatText}>AI hjælper dig med at sætte ord på det. Klinikken vurderer endeligt.</Text>
        {onDescribe ? <Text style={styles.start}>Start</Text> : <Badge label="Kommer snart" />}
      </Pressable>
      <Button label="Find en klinik" onPress={onFindClinic} />
      <Button label="Jeg har ondt" variant="secondary" onPress={onEmergency} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  chat: {
    minHeight: MIN_TOUCH,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand200,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  chatOff: { opacity: 0.85 },
  chatTitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  chatText: { fontSize: fontSize.sm, color: colors.inkMuted },
  start: { alignSelf: "flex-start", backgroundColor: colors.brand600, color: colors.onBrand, fontWeight: "700", fontSize: fontSize.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, overflow: "hidden" },
});
