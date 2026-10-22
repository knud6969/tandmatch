import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "~/components/ui";
import { colors, iconSize, MIN_TOUCH, spacing, type } from "~/theme";

type Props = {
  // Åbner chatten (/start). Uden `onDescribe` er knappen deaktiveret og mærket "Kommer snart".
  onDescribe?: () => void;
  onFindClinic: () => void;
  onEmergency: () => void;
};

// Række med titel, evt. lille tekst og pil. Hele rækken er trykfladen.
function EntryRow({ title, text, onPress }: { title: string; text?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text ? `${title}. ${text}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={type.label}>{title}</Text>
        {text ? <Text style={type.caption}>{text}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.inkMuted} />
    </Pressable>
  );
}

// Forsidens tre indgange (architecture 13.4, 13.9): én primær knap, "Beskriv dit problem", og to rolige rækker med pil.
// Akutvejen er altid ét tryk væk og har 112-teksten under sig.
export function HomeEntries({ onDescribe, onFindClinic, onEmergency }: Props) {
  return (
    <View style={styles.wrap}>
      <Button
        label={onDescribe ? "Beskriv dit problem" : "Beskriv dit problem (kommer snart)"}
        accessibilityLabel={onDescribe ? "Beskriv dit problem eller upload et billede" : "Beskriv dit problem. Kommer snart"}
        disabled={!onDescribe}
        onPress={onDescribe ?? (() => undefined)}
      />
      <View style={styles.list}>
        <EntryRow title="Find en klinik" onPress={onFindClinic} />
        <View style={styles.divider} />
        <EntryRow title="Jeg har ondt" text="Klinikker med ledig akuttid. Ved livstruende symptomer ring 112." onPress={onEmergency} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl },
  list: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  divider: { height: 1, backgroundColor: colors.line },
  row: { minHeight: MIN_TOUCH + spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  pressed: { opacity: 0.6 },
});
